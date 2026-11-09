import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  createDefaultJigConfig,
  createDefaultJigPrefs,
  type JigConfig,
  type JigPrefs
} from '../core/config'
import {
  buildDrillTable,
  openDrill as openDrillState,
  resolvePivotPns,
  type DrillFrom,
  type DrillState
} from '../core/drill'
import { readExcel, validateSource, writeExcel, type SourceData } from '../core/excel'
import { pickExportTarget } from '../core/export'
import { generatePivot, type StageCategory } from '../core/pivot'
import {
  computePivotScope,
  pivotScopePn,
  type PivotScope,
  type PivotScopeResult
} from '../core/pivotScope'
import { processSourceData, queryData } from '../core/query'
import type { ReviewScope } from '../core/review'
import {
  ALL_PN,
  computeReviewView,
  filterReviewByPn,
  reviewPnOptions,
  type ReviewView
} from '../core/reviewView'
import type { Row, Table } from '../core/table'
import { rulesFromConfig, validateSizeMatch } from '../core/validate'
import {
  canPickJigFile,
  dirname,
  pickJigExcelFile,
  readPickedFile
} from '@/platform/jigFile'
import {
  canExportJig,
  exportJigFile,
  safeFileName,
  withTimestamp
} from '@/platform/jigExport'
import { readRaw, writeRaw, STORAGE_KEYS } from '@/platform/storage'

/**
 * JIG 页的数据状态。
 *
 * 一条链路：源 Excel → 四个视图各自的表。四个视图共享**同一份源数据**，
 * 切页不重新读文件 —— 这也是「侧栏一个入口 + 页内四段」而不是
 * 「四个侧栏入口」的原因。
 *
 * 状态分层：
 * - 源数据（source）在内存里，刷新就没了 —— 它是用户当场挑的文件，
 *   不进备份也不进 localStorage（几百 KB 到几 MB 存进 localStorage 没有意义）；
 * - 业务配置（映射表、工序顺序）进备份文件，P8 接上；
 * - 本机偏好（源目录）进 localStorage。
 */

/** 四个视图各自的表 */
export interface JigTables {
  /** 查询结果 */
  detail: Table
  /** 结果透视 */
  queryPivot: Table
  /** 数据审查 */
  review: Table
}

const EMPTY_TABLE: Table = { columns: [], rows: [] }

const EMPTY_TABLES: JigTables = {
  detail: EMPTY_TABLE,
  queryPivot: EMPTY_TABLE,
  review: EMPTY_TABLE
}

export interface UseJigDataOptions {
  /** 业务配置（型号→尺寸映射、工序顺序等） */
  config: JigConfig
  /** 提示条 */
  notify: (text: string, tone?: 'info' | 'warning' | 'error') => void
}

export interface JigData {
  /** 源数据是否已载入 */
  ready: boolean
  /** 源文件名（壳里显示完整路径） */
  sourceName: string
  /** 源文件路径 */
  sourcePath: string
  /** 三个视图的表（全量透视由 scope 单独给出 —— 它带筛选状态） */
  tables: JigTables
  /** 全量透视的显示范围 */
  pivotScope: PivotScope
  /** 改显示范围 */
  setPivotScope: (scope: PivotScope) => void
  /** 全量透视的可用性筛选档位 */
  pivotAvail: StageCategory
  /** 改可用性筛选 */
  setPivotAvail: (avail: StageCategory) => void
  /** 全量透视的当前结果（表 + 计数 + P/N 候选） */
  pivot: PivotScopeResult
  /** 当前的下钻状态；null = 没在下钻 */
  drill: DrillState | null
  /** 下钻的明细表 */
  drillTable: Table
  /** 审查页的 P/N 过滤 */
  reviewPn: string
  /** 改审查页的 P/N 过滤 */
  setReviewPn: (pn: string) => void
  /** 审查页的视野档位 */
  reviewScope: ReviewScope
  /** 改审查页的视野档位 */
  setReviewScope: (scope: ReviewScope) => void
  /** 审查页的当前视图（表 + 标红标记 + 两档计数） */
  review: ReviewView
  /** 审查页的 P/N 候选 */
  reviewPnOptions: string[]
  /** 查询结果页的标红标记（与 table.rows 同序） */
  detailFlags: boolean[]
  /** 下钻明细的标红标记（与 table.rows 同序） */
  drillFlags: boolean[]
  /** 能否导出（静态版不行） */
  canExport: boolean
  /** 导出当前视图 */
  exportCurrent: (tab: 'detail' | 'queryPivot' | 'pivot' | 'review') => Promise<void>
  /**
   * 点透视表的计数格进入下钻。
   *
   * 只有结果透视与全量透视两页有下钻；其余页传进来直接忽略。
   */
  drillTo: (from: DrillFrom, rowIndex: number, column: string) => void
  /** 退出下钻，回到透视表 */
  exitDrill: () => void
  /** 正在读文件 */
  busy: boolean
  /** 能否选文件（静态版不行） */
  canPick: boolean
  /** 选文件 → 读 → 建表 */
  pickSource: () => Promise<void>
  /** 用给定的 ID 列表跑查询 */
  runQuery: (ids: string[]) => void
  /** 清空查询结果（不动源数据） */
  clearQuery: () => void
}

export function useJigData({ config, notify }: UseJigDataOptions): JigData {
  const [source, setSource] = useState<SourceData | null>(null)
  const [sourcePath, setSourcePath] = useState('')
  const [tables, setTables] = useState<JigTables>(EMPTY_TABLES)
  const [busy, setBusy] = useState(false)
  const [pivotScope, setPivotScope] = useState<PivotScope>('all')
  const [pivotAvail, setPivotAvail] = useState<StageCategory>('all')
  const [drill, setDrill] = useState<DrillState | null>(null)
  /** 审查页的 P/N 过滤与视野档位 */
  const [reviewPn, setReviewPn] = useState(ALL_PN)
  const [reviewScope, setReviewScope] = useState<ReviewScope>('all')
  /**
   * 本次查询命中的源行（快照）。
   *
   * 结果透视的下钻底稿必须是它 —— 透视表是「命中记录的汇总」，
   * 下钻要回到同样的记录上，不能拿全部源数据去筛。
   */
  const [queryHits, setQueryHits] = useState<Row[]>([])

  /**
   * 全量透视的当前结果。
   *
   * 口径全在 `computePivotScope` 里 —— 组件只管渲染。
   * 工序轨道的计数取自这张表的「总计」行，与表里的数字必然一致。
   */
  const pivot = useMemo(
    () =>
      computePivotScope(source?.rows ?? [], pivotScope, pivotAvail, config),
    [config, pivotAvail, pivotScope, source]
  )

  /**
   * 下钻的明细表。
   *
   * 底稿与当前显示的透视表同源 —— 全量透视用透视的底稿，
   * 结果透视用查询命中的行。底稿不同，筛出的行数就与格子上的数字对不上。
   */
  const drillTable = useMemo(
    () =>
      buildDrillTable(
        drill,
        drill?.from === 'queryPivot' ? queryHits : pivot.rows,
        config
      ),
    [config, drill, pivot.rows, queryHits]
  )

  /** Esc 退出下钻 */
  useEffect(() => {
    if (!drill) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrill(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drill])

  /**
   * 审查页的当前视图。
   *
   * 口径全在 `computeReviewView` 里：先按 P/N 过滤，再分类，再按档筛行。
   *
   * **审查页不过「标出尺寸不匹配」开关** —— 它的存在意义就是挑出对不上的
   * JIG，关掉标红这页就没有内容了。
   */
  const review = useMemo(
    () =>
      computeReviewView(
        filterReviewByPn(tables.review, reviewPn),
        reviewScope,
        rulesFromConfig(config)
      ),
    [config, reviewPn, reviewScope, tables.review]
  )

  /**
   * 查询结果页的标红标记。
   *
   * **跟随「标出尺寸不匹配」开关**（与审查页不同）。
   */
  const detailFlags = useMemo(() => {
    if (!config.sizeValidationEnabled) return []
    const rules = rulesFromConfig(config)
    return tables.detail.rows.map(row => {
      const size = row['对应尺寸'] ?? ''
      return !validateSizeMatch(row['P/N'] ?? '', size, rules)
    })
  }, [config, tables.detail.rows])

  /**
   * 下钻明细的标红标记。
   *
   * **默认标出**，不跟随查询结果页的开关 —— 这一页就是用来核对下钻结果的，
   * 用户没勾选时看到的是一片「全部匹配」，容易误判。
   */
  const drillFlags = useMemo(() => {
    if (!config.sizeValidationEnabled) return []
    const rules = rulesFromConfig(config)
    return drillTable.rows.map(row => {
      const size = row['对应尺寸'] ?? ''
      return !validateSizeMatch(row['P/N'] ?? '', size, rules)
    })
  }, [config, drillTable.rows])

  /** 审查页的 P/N 候选：取自全部审查行，不受当前过滤影响 */
  const reviewPnList = useMemo(
    () => reviewPnOptions(tables.review),
    [tables.review]
  )

  /** 上次用过的源文件目录 —— 本机偏好，不进备份 */
  const sourceDir = useMemo(() => {
    const raw = readRaw(STORAGE_KEYS.jigSourceDir)
    const trimmed = raw?.trim()
    return trimmed ? trimmed : null
  }, [])

  /** 上次用过的导出目录 —— 本机偏好，不进备份 */
  const exportDir = useMemo(() => {
    const raw = readRaw(STORAGE_KEYS.jigExportDir)
    const trimmed = raw?.trim()
    return trimmed ? trimmed : null
  }, [])

  /** 导出文件名是否加时间戳 —— 本机偏好，不进备份 */
  const exportTimestampEnabled = useMemo(() => {
    const raw = readRaw(STORAGE_KEYS.jigExportTimestamp)
    // 默认关闭 —— 与原项目一致（默认导出「审查数据.xlsx」这种固定名）
    return raw === '1'
  }, [])

  const pickSource = useCallback(async () => {
    if (!canPickJigFile()) {
      notify('选择文件需要桌面版', 'warning')
      return
    }

    setBusy(true)
    try {
      const picked = await pickJigExcelFile(sourceDir)
      if (!picked) {
        setBusy(false)
        return
      }

      const bytes = await readPickedFile(picked.path)
      // plugin 侧返回的是字节数组；xlsx 要 ArrayBuffer
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer

      const data = await readExcel(buffer, picked.name)
      const error = validateSource(data)
      if (error) {
        notify(error, 'error')
        setBusy(false)
        return
      }

      setSource(data)
      setSourcePath(picked.path)
      writeRaw(STORAGE_KEYS.jigSourceDir, dirname(picked.path))

      // 换了源数据，旧的查询命中与三张表都作废
      setTables({
        detail: EMPTY_TABLE,
        queryPivot: EMPTY_TABLE,
        review: processSourceData(data.rows, config)
      })

      // 筛选状态也复位 —— 旧的 P/N 范围在新文件里可能不存在
      setPivotScope('all')
      setPivotAvail('all')
      setDrill(null)
      setQueryHits([])

      notify(`已载入 ${picked.name} · ${data.rows.length} 行`, 'info')
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(false)
    }
  }, [config, notify, sourceDir])

  const runQuery = useCallback(
    (ids: string[]) => {
      if (!source) {
        notify('请先载入源数据', 'warning')
        return
      }
      if (ids.length === 0) {
        notify('请输入要查询的 Jig ID', 'warning')
        return
      }

      const detail = queryData(source.rows, ids, config)
      // 结果透视基于**命中的行**（与旧版一致），不是全部源数据
      const hits = source.rows.filter((row: Row) => ids.includes(row['Jig ID']))

      setTables(prev => ({
        ...prev,
        detail,
        queryPivot: generatePivot(hits, false, config)
      }))
      setQueryHits(hits)
      // 新的查询结果，旧的下钻定位不再有意义
      setDrill(null)

      const found = detail.rows.filter(row => row['P/N'] !== '【未找到】').length
      notify(`查询 ${detail.rows.length} 条 · 命中 ${found} · 未找到 ${detail.rows.length - found}`)
    },
    [config, notify, source]
  )

  const clearQuery = useCallback(() => {
    setTables(prev => ({
      ...prev,
      detail: EMPTY_TABLE,
      queryPivot: EMPTY_TABLE
    }))
    setQueryHits([])
    setDrill(null)
  }, [])

  /**
   * 点透视表的计数格进入下钻。
   *
   * `rowIndex` 是**当前显示的那张透视表**的行下标 —— 全量透视用带筛选的
   * 透视表，结果透视用命中记录的透视表。两者行数不同，下标各算各的。
   */
  const drillTo = useCallback(
    (from: DrillFrom, rowIndex: number, column: string) => {
      const table = from === 'pivot' ? pivot.table : tables.queryPivot
      const next = openDrillState({
        rowIndex,
        column,
        from,
        table,
        viewPns: resolvePivotPns(table, config.keywordTotal),
        scopePn: from === 'pivot' ? pivotScopePn(pivotScope) : '',
        scopeIsProd: from === 'pivot' && pivotScope === 'prod',
        config
      })
      if (next) setDrill(next)
    },
    [config, pivot.table, pivotScope, tables.queryPivot]
  )

  const exitDrill = useCallback(() => setDrill(null), [])

  /**
   * 导出当前视图。
   *
   * 导出跟着「看到的」走 —— 下钻时导出的是明细，审查页切到「尺寸不匹配」
   * 后导出拿到的就是一张纯异常清单。
   */
  const exportCurrent = useCallback(
    async (tab: 'detail' | 'queryPivot' | 'pivot' | 'review') => {
      if (!canExportJig()) {
        notify('导出需要桌面版', 'warning')
        return
      }

      const target = pickExportTarget({
        tab,
        detail: tables.detail,
        detailFlags,
        queryPivot: tables.queryPivot,
        pivot: pivot.table,
        review: review.table,
        reviewFlags: review.flags,
        drill,
        drillTable,
        drillFlags,
        config
      })

      if (!target) {
        notify('当前页面没有可导出的数据', 'error')
        return
      }

      // 文件名不能含路径分隔符等非法字符（P/N、工序名里可能出现）
      const safeName = safeFileName(target.name)
      const fileName = exportTimestampEnabled
        ? withTimestamp(`${safeName}.xlsx`)
        : `${safeName}.xlsx`

      try {
        // writeExcel 是异步的 —— xlsx 库按需加载（见 core/excel.ts 文件头）
        const buffer = await writeExcel(target.table, target.red)
        const bytes = new Uint8Array(buffer)
        const path = await exportJigFile(fileName, bytes, exportDir)
        if (!path) return // 用户取消
        notify(`已导出 ${fileName}`, 'info')
      } catch (error) {
        notify(
          `导出失败：${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
      }
    },
    [
      config,
      detailFlags,
      drill,
      drillFlags,
      drillTable,
      exportDir,
      exportTimestampEnabled,
      notify,
      pivot.table,
      review.flags,
      review.table,
      tables.detail,
      tables.queryPivot
    ]
  )

  return {
    ready: source !== null,
    sourceName: source?.fileName ?? '',
    sourcePath,
    tables,
    pivotScope,
    setPivotScope,
    pivotAvail,
    setPivotAvail,
    pivot,
    drill,
    drillTable,
    drillTo,
    exitDrill,
    reviewPn,
    setReviewPn,
    reviewScope,
    setReviewScope,
    review,
    reviewPnOptions: reviewPnList,
    detailFlags,
    drillFlags,
    busy,
    canPick: canPickJigFile(),
    pickSource,
    runQuery,
    clearQuery,
    canExport: canExportJig(),
    exportCurrent
  }
}

/** 本机偏好的默认值（后续 P8 会把它接到设置面板） */
export function defaultJigPrefs(): JigPrefs {
  return createDefaultJigPrefs()
}
