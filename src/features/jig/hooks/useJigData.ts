import { useCallback, useMemo, useState } from 'react'

import {
  createDefaultJigConfig,
  createDefaultJigPrefs,
  type JigConfig,
  type JigPrefs
} from '../core/config'
import { readExcel, validateSource, type SourceData } from '../core/excel'
import { generatePivot, type StageCategory } from '../core/pivot'
import {
  computePivotScope,
  type PivotScope,
  type PivotScopeResult
} from '../core/pivotScope'
import { processSourceData, queryData } from '../core/query'
import type { Row, Table } from '../core/table'
import {
  canPickJigFile,
  dirname,
  pickJigExcelFile,
  readPickedFile
} from '@/platform/jigFile'
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

  /** 上次用过的源文件目录 —— 本机偏好，不进备份 */
  const sourceDir = useMemo(() => {
    const raw = readRaw(STORAGE_KEYS.jigSourceDir)
    const trimmed = raw?.trim()
    return trimmed ? trimmed : null
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
  }, [])

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
    busy,
    canPick: canPickJigFile(),
    pickSource,
    runQuery,
    clearQuery
  }
}

/** 本机偏好的默认值（后续 P8 会把它接到设置面板） */
export function defaultJigPrefs(): JigPrefs {
  return createDefaultJigPrefs()
}
