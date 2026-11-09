import { useCallback, useEffect, useMemo, useState } from 'react'

import { prepareQueryIds } from '../core/clipboard'
import {
  createDefaultJigConfig,
  createDefaultJigPrefs,
  mergeJigPrefs,
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
import { readJigConfigFile, updateJigConfigFile } from '@/platform/jigConfigFile'
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

/**
 * 两张「由查询派生」的表。
 *
 * 数据审查表不在这里 —— 它带 P/N 过滤与视野档位，由 `review` 单独给出。
 */
export interface JigTables {
  /** 查询结果 */
  detail: Table
  /** 结果透视 */
  queryPivot: Table
}

const EMPTY_TABLE: Table = { columns: [], rows: [] }

/**
 * 底部状态轨的状态灯。
 *
 * 三态足够：空闲（还没载入）/ 处理中 / 就绪，外加出错。
 * 颜色语义与本项目一致 —— 就绪用品牌青，出错用危险红。
 */
export type JigStatus = 'idle' | 'busy' | 'ready' | 'error'

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
  /** 两张查询派生的表（全量透视与审查各由自己的筛选状态给出） */
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
  /** 本机偏好（源目录、导出目录、行高、粘贴开关、时间戳开关） */
  prefs: JigPrefs
  /** 保存本机偏好 */
  savePrefs: (
    prefs: JigPrefs,
    dirs: { sourceDir: string | null; exportDir: string | null }
  ) => void
  /** 查询结果页的标红标记（与 table.rows 同序） */
  detailFlags: boolean[]
  /** 下钻明细的标红标记（与 table.rows 同序） */
  drillFlags: boolean[]
  /**
   * 「标出尺寸不匹配」开关（查询结果页工具条左侧）。
   *
   * **与配置里的 `sizeValidationEnabled` 分开**：那是从备份带过来的默认值，
   * 这个是本次会话的临时开关 —— 用户看一眼标红太多，随手关掉，不想改配置。
   */
  sizeValidation: boolean
  /** 改「标出尺寸不匹配」开关 */
  setSizeValidation: (on: boolean) => void
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
  /** 状态灯：空闲 / 处理中 / 就绪 / 出错 */
  status: JigStatus
  /** 常驻日志：最近一次动作的结果（不带时间戳，只留最新一条） */
  log: string
  /** 源数据行数（底部栏「源 N 行」） */
  sourceRows: number
  /** 源数据列数 */
  sourceColumns: number
  /** 已选中但尚未加载的文件路径；null = 没选过 */
  pendingPath: string | null
  /** 已选中但尚未加载的文件名 */
  pendingName: string | null
  /**
   * 是否处于「已选未加载」状态（顶栏标「（待加载）」）。
   *
   * 按**路径是否与已载入的相同**判定 —— 重新加载同一个文件时两者相等，
   * 但此刻数据确实是新的，不该标成待加载。
   */
  pendingUnloaded: boolean
  /**
   * 输入框里的原始文本（每行一个 Jig ID）。
   *
   * **提到 hook 里而不是留在组件里**：顶栏的「加载」按钮在外壳层，
   * 要判断「输入框是不是空的」必须能在这里读到 —— 空的话加载完跳
   * 全量透视（没填 ID 就没有查询结果可看）。
   */
  queryInput: string
  /** 改输入框内容 */
  setQueryInput: (next: string | ((prev: string) => string)) => void
  /**
   * 成功加载的次数。
   *
   * 界面靠它察觉「刚加载完」—— 加载本身不携带意图（要不要跳页、跳哪一页），
   * 那是界面的事。
   */
  loadCount: number
  /** 读已选中的文件 */
  loadSource: () => Promise<void>
  /** 能否选文件（静态版不行） */
  canPick: boolean
  /** 选文件 → 读 → 建表 */
  pickSource: () => Promise<void>
  /** 用给定的 ID 列表跑查询；返回是否真的查了 */
  runQuery: (ids: string[]) => boolean
  /** 清空查询结果（不动源数据） */
  clearQuery: () => void
}

export function useJigData({ config, notify }: UseJigDataOptions): JigData {
  const [source, setSource] = useState<SourceData | null>(null)
  const [sourcePath, setSourcePath] = useState('')
  /**
   * 已选中的文件（点「浏览…」后有了，点「加载」才真的读）。
   *
   * 「浏览…」与「加载」分成两步 —— 选完先看文件名与路径，不满意能换；
   * 点「加载」才真的读。MES 导出的文件动辄几百 KB 到几 MB，
   * 一步到位时选错文件就得从头再走一遍对话框。
   *
   * **加载成功后不清** —— 留着才能重复点「加载」做热刷新（源文件更新了，
   * 同一批 Jig ID 直接在新数据上重查）。
   */
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  /** 当前已载入的源文件路径 —— 用来判断 pending 是不是「还没加载的那个」 */
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  /** 输入框里的原始文本 —— 提到 hook 里，外壳层的「加载」按钮也要读它 */
  const [queryInput, setQueryInputState] = useState('')
  /** 成功加载的次数 —— 界面靠它察觉「刚加载完」 */
  const [loadCount, setLoadCount] = useState(0)

  /**
   * 改输入框内容。
   *
   * 支持 updater 形式 —— 粘贴时要「在原内容后追加」，用的是同一份旧值，
   * 先读再写中间可能已被别的操作改过。
   */
  const setQueryInput = useCallback(
    (next: string | ((prev: string) => string)) => {
      setQueryInputState(prev => (typeof next === 'function' ? next(prev) : next))
    },
    []
  )
  const [busy, setBusy] = useState(false)
  /**
   * 「标出尺寸不匹配」开关（查询结果页）。
   *
   * 初值取配置里的 `sizeValidationEnabled`。
   * **这是本次会话的临时开关，不写回配置** —— 用户看一眼标红太多随手关掉，
   * 不该因此把备份里的配置改了。
   */
  const [sizeValidation, setSizeValidation] = useState(
    config.sizeValidationEnabled
  )
  /**
   * 底部状态轨的两项：状态灯与常驻日志。
   *
   * **只留最新一条**，不攒历史 —— 原项目也是这么做的：
   * 底部那行是「现在怎么样」，不是日志文件。攒历史反而要在旁边加滚动，
   * 把它变成第二个内容区。
   */
  const [status, setStatus] = useState<JigStatus>('idle')
  const [log, setLog] = useState('等待载入源数据')
  const [pivotScope, setPivotScope] = useState<PivotScope>('all')
  const [pivotAvail, setPivotAvail] = useState<StageCategory>('all')
  const [drill, setDrill] = useState<DrillState | null>(null)
  /** 审查页的 P/N 过滤与视野档位 */
  const [reviewPn, setReviewPn] = useState(ALL_PN)
  const [reviewScope, setReviewScope] = useState<ReviewScope>('all')
  /**
   * 上次查询用的 ID 列表。
   *
   * **只存 ID，不存算好的表** —— 查询结果依赖型号→尺寸映射表，
   * 改了映射就必须重算。存成算好的表的话，改完映射界面上的「对应尺寸」
   * 列还是旧值，用户会以为保存没生效；导出的文件里也是旧值，
   * 拿去做尺寸核对会得出错误结论。
   */
  const [queryIds, setQueryIds] = useState<string[]>([])

  /**
   * 本次查询命中的源行。
   *
   * 结果透视的下钻底稿必须是它 —— 透视表是「命中记录的汇总」，
   * 下钻要回到同样的记录上，不能拿全部源数据去筛。
   */
  const queryHits = useMemo(() => {
    if (!source || queryIds.length === 0) return []
    return source.rows.filter((row: Row) => queryIds.includes(row['Jig ID']))
  }, [queryIds, source])

  /** 查询结果表 */
  const detailTable = useMemo(() => {
    if (!source || queryIds.length === 0) return EMPTY_TABLE
    return queryData(source.rows, queryIds, config)
  }, [config, queryIds, source])

  /** 结果透视表：基于命中的行 */
  const queryPivotTable = useMemo(() => {
    if (queryHits.length === 0) return EMPTY_TABLE
    return generatePivot(queryHits, false, config)
  }, [config, queryHits])

  /** 两张表的集合（供界面统一取用） */
  const tables: JigTables = useMemo(
    () => ({ detail: detailTable, queryPivot: queryPivotTable }),
    [detailTable, queryPivotTable]
  )

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
   * 审查页的「全部」视图。
   *
   * **派生而不是存起来** —— 它依赖型号→尺寸映射表，改了映射就必须重算。
   * 存成 state 的话，改完映射界面上的「对应尺寸」列还是旧值，
   * 用户会以为保存没生效；导出的文件里也是旧值，拿去做尺寸核对
   * 会得出错误结论。
   */
  const reviewAllTable = useMemo(
    () => (source ? processSourceData(source.rows, config) : EMPTY_TABLE),
    [config, source]
  )

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
        filterReviewByPn(reviewAllTable, reviewPn),
        reviewScope,
        rulesFromConfig(config)
      ),
    [config, reviewAllTable, reviewPn, reviewScope]
  )

  /**
   * 查询结果页的标红标记。
   *
   * **跟随「标出尺寸不匹配」开关**（与审查页不同）。
   *
   * 开关初值取配置里的 `sizeValidationEnabled`（默认 false），
   * 但它是**本次会话的临时开关** —— 用户看一眼标红太多随手关掉，
   * 不该因此把配置改了。
   */
  const detailFlags = useMemo(() => {
    if (!sizeValidation) return []
    const rules = rulesFromConfig(config)
    return detailTable.rows.map(row => {
      const size = row['对应尺寸'] ?? ''
      return !validateSizeMatch(row['P/N'] ?? '', size, rules)
    })
  }, [config, detailTable.rows, sizeValidation])

  /**
   * 下钻明细的标红标记。
   *
   * **恒定标出**，不受「标出尺寸不匹配」开关影响 —— 与原项目同一口径。
   * 这一页就是用来核对下钻结果的，用户没勾选时看到的是一片「全部匹配」，
   * 容易误判。
   */
  const drillFlags = useMemo(() => {
    const rules = rulesFromConfig(config)
    return drillTable.rows.map(row => {
      const size = row['对应尺寸'] ?? ''
      return !validateSizeMatch(row['P/N'] ?? '', size, rules)
    })
  }, [config, drillTable.rows])

  /** 审查页的 P/N 候选：取自全部审查行，不受当前过滤影响 */
  const reviewPnList = useMemo(
    () => reviewPnOptions(reviewAllTable),
    [reviewAllTable]
  )

  /**
   * 本机偏好：源目录、导出目录、行高、粘贴开关、时间戳开关。
   *
   * **从 localStorage 读一次，之后由 state 持有** —— 设置面板改完要立刻生效，
   * 不能每次都去读盘（读盘是同步的，会卡一下）。
   */
  const [prefs, setPrefs] = useState<JigPrefs>(() => {
    const defaults = createDefaultJigPrefs()
    const read = (key: string) => {
      const raw = readRaw(key)
      return raw?.trim() || null
    }
    return {
      ...defaults,
      sourceDir: read(STORAGE_KEYS.jigSourceDir) ?? defaults.sourceDir,
      exportDir: read(STORAGE_KEYS.jigExportDir) ?? defaults.exportDir,
      rowHeight: (() => {
        const raw = read(STORAGE_KEYS.jigRowHeight)
        const value = raw ? Number(raw) : NaN
        return Number.isFinite(value) && value > 0 ? value : defaults.rowHeight
      })(),
      exportTimestampEnabled:
        readRaw(STORAGE_KEYS.jigExportTimestamp) === null
          ? defaults.exportTimestampEnabled
          : readRaw(STORAGE_KEYS.jigExportTimestamp) === '1',
      clipboardAutoProcessEnabled:
        readRaw(STORAGE_KEYS.jigClipboardProcess) === null
          ? defaults.clipboardAutoProcessEnabled
          : readRaw(STORAGE_KEYS.jigClipboardProcess) === '1'
    }
  })

  /**
   * 启动后以配置文件里的偏好为准（壳里才有）。
   *
   * localStorage 只是初值与 Web 版兜底；文件存在时覆盖它。
   * 行高这类偏好以前只存在内存里，重启会丢 —— 现在一并进文件。
   */
  useEffect(() => {
    let cancelled = false
    void readJigConfigFile().then(file => {
      if (cancelled || !file?.prefs) return
      setPrefs(mergeJigPrefs(file.prefs as Record<string, unknown>))
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** 上次用过的源文件目录 —— 本机偏好，不进备份 */
  const sourceDir = prefs.sourceDir || null

  /** 上次用过的导出目录 —— 本机偏好，不进备份 */
  const exportDir = prefs.exportDir || null

  /** 导出文件名是否加时间戳 —— 本机偏好，不进备份 */
  const exportTimestampEnabled = prefs.exportTimestampEnabled

  /**
   * 表格行高 → CSS 变量。
   *
   * 走 CSS 变量而不是 props：行高是**显示**层面的偏好，表格有四张，
   * 层层传 props 既啰嗦又容易漏。改一次根节点的变量，整张表跟着变。
   *
   * 行高（px）换算成单元格上下 padding：内容高约 16px，所以
   * padding = (rowHeight - 16) / 2。
   */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const pad = Math.max(2, Math.round((prefs.rowHeight - 16) / 2))
    document.documentElement.style.setProperty('--jig-row-pad', `${pad}px`)
  }, [prefs.rowHeight])

  /**
   * 保存本机偏好：写进 localStorage 并更新 state。
   *
   * **不进备份文件** —— 换个机器就该按新机器的情况重设，
   * 把旧机器的路径搬过去只会指向一个不存在的目录。
   */
  const savePrefs = useCallback(
    (
      next: JigPrefs,
      dirs: { sourceDir: string | null; exportDir: string | null }
    ) => {
      if (dirs.sourceDir) writeRaw(STORAGE_KEYS.jigSourceDir, dirs.sourceDir)
      else writeRaw(STORAGE_KEYS.jigSourceDir, '')

      if (dirs.exportDir) writeRaw(STORAGE_KEYS.jigExportDir, dirs.exportDir)
      else writeRaw(STORAGE_KEYS.jigExportDir, '')

      writeRaw(
        STORAGE_KEYS.jigExportTimestamp,
        next.exportTimestampEnabled ? '1' : '0'
      )
      writeRaw(
        STORAGE_KEYS.jigClipboardProcess,
        next.clipboardAutoProcessEnabled ? '1' : '0'
      )
      writeRaw(STORAGE_KEYS.jigRowHeight, String(next.rowHeight))

      const merged: JigPrefs = {
        ...next,
        sourceDir: dirs.sourceDir ?? '',
        exportDir: dirs.exportDir ?? ''
      }
      setPrefs(merged)
      // 桌面版：整份偏好落盘到配置文件（读-改-写，保留配置里的 config 段）
      void updateJigConfigFile({ prefs: merged })
    },
    []
  )

  /**
   * 第一步：选文件（**不读**）。
   *
   * 与原项目一致，分「浏览…」与「加载」两步：
   * 选完先看到文件名与路径，不满意还能再换一个；点「加载」才真的读。
   * MES 导出的 Excel 动辄几百 KB 到几 MB，一步到位时选错文件就得重来。
   *
   * 这里比原项目多一步：原项目是浏览器 `<input type=file>`，选完拿不到路径；
   * 壳里能拿到真实路径，所以「已选择」之后可以先把路径记下来，
   * 「加载」时直接按路径读 —— 不用把文件内容先缓在内存里。
   */
  const pickSource = useCallback(async () => {
    if (!canPickJigFile()) {
      notify('选择文件需要桌面版', 'warning')
      return
    }

    try {
      const picked = await pickJigExcelFile(sourceDir)
      if (!picked) {
        setStatus(source ? 'ready' : 'idle')
        setLog(source ? '已取消选择源文件' : '等待载入源数据')
        return
      }

      setPendingPath(picked.path)
      setPendingName(picked.name)
      setStatus('idle')
      setLog(`已选择 ${picked.name}，点「加载」读取`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      notify(message, 'error')
      setStatus('error')
      setLog(message)
    }
  }, [notify, source, sourceDir])

  /**
   * 第二步：读取已选中的文件。
   *
   * 没选过文件就点「加载」是空操作 —— 按钮本来就是灰的。
   */
  const loadSource = useCallback(async () => {
    if (!pendingPath) return

    setBusy(true)
    setStatus('busy')
    setLog('正在读取源文件…')
    try {
      const bytes = await readPickedFile(pendingPath)
      // plugin 侧返回的是字节数组；xlsx 要 ArrayBuffer
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer

      const data = await readExcel(buffer, pendingName ?? '源文件')
      const error = validateSource(data)
      if (error) {
        notify(error, 'error')
        setBusy(false)
        setStatus('error')
        setLog(error)
        return
      }

      setSource(data)
      setSourcePath(pendingPath)
      setLoadedPath(pendingPath)
      writeRaw(STORAGE_KEYS.jigSourceDir, dirname(pendingPath))

      /*
       * **不清空查询结果** —— 热加载。
       *
       * 查询结果表是由 (queryIds, source) 派生出来的：不清 queryIds，
       * setSource 一改，表就按新数据自动重算了。所以保留上次的 ID，
       * 用户点「加载」刷新源文件后，看到的是同一批 ID 在新文件里的最新结果，
       * 不用再点一次「开始查询」。
       *
       * 派生链断在这里的话（改成清空 queryIds），用户会以为刷新没生效 ——
       * 明明新文件里已经查得到那些 Jig 了，页面上却是一片空。
       */
      // 筛选状态复位 —— 旧的 P/N 范围在新文件里可能不存在
      setPivotScope('all')
      setPivotAvail('all')
      // 下钻的定位键是按旧透视表算的，新数据下对不上
      setDrill(null)

      // 有过查询时，顺带报一下按新数据重算后的命中情况
      let summary = `已载入 ${data.rows.length} 行 · ${data.columns.length} 列`
      if (queryIds.length > 0) {
        const detail = queryData(data.rows, queryIds, config)
        const found = detail.rows.filter(row => row['P/N'] !== '【未找到】').length
        summary += ` · 已重查 ${detail.rows.length} 条 · 命中 ${found}`
      }

      setStatus('ready')
      setLog(summary)
      notify(summary, 'info')
      setLoadCount(n => n + 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      notify(message, 'error')
      setStatus('error')
      setLog(message)
    } finally {
      setBusy(false)
    }
  }, [config, notify, pendingName, pendingPath, queryIds])

  /**
   * 执行查询。
   *
   * **返回是否真的查了**：没源数据或 ID 为空时会提前返回 false ——
   * 界面据此决定要不要跳到「查询结果」页（查都没查，跳过去是空的）。
   */
  const runQuery = useCallback(
    (ids: string[]): boolean => {
      if (!source) {
        notify('请先载入源数据', 'warning')
        setStatus('idle')
        setLog('请先载入源数据')
        return false
      }
      if (ids.length === 0) {
        notify('请输入要查询的 Jig ID', 'warning')
        setLog('请输入要查询的 Jig ID')
        return false
      }

      /*
       * 输入框是自由文本：逐行归一化、去重、丢掉认不出的行。
       *
       * 纯 ID 列表粘贴时可能带重复行 —— 查询前不收敛的话，明细里会出现
       * 重复行，命中 / 未找到的统计也会翻倍；整封邮件被粘进来时，
       * 不校验则每一行都会被当成 ID 去查。
       */
      const { ids: queryIdsToRun, ignored } = prepareQueryIds(ids)
      if (queryIdsToRun.length === 0) {
        const message = `没有识别到有效的 Jig ID（${ignored} 行无法识别）`
        notify(message, 'warning')
        setLog(message)
        return false
      }

      // 只存 ID —— 表由配置派生，改了映射表会自动重算
      setQueryIds(queryIdsToRun)
      // 新的查询结果，旧的下钻定位不再有意义
      setDrill(null)

      const detail = queryData(source.rows, queryIdsToRun, config)
      const found = detail.rows.filter(row => row['P/N'] !== '【未找到】').length
      const base = `查询 ${detail.rows.length} 条 · 命中 ${found} · 未找到 ${detail.rows.length - found}`
      const text = ignored > 0 ? `${base} · 已忽略 ${ignored} 行` : base
      setStatus('ready')
      setLog(text)
      notify(text)
      return true
    },
    [config, notify, source]
  )

  const clearQuery = useCallback(() => {
    setQueryIds([])
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
        setStatus('error')
        setLog('当前页面没有可导出的数据')
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
        if (!path) {
          setStatus('ready')
          setLog('已取消导出')
          return // 用户取消
        }
        const redCount = target.red?.rows.filter(Boolean).length ?? 0
        const text =
          redCount > 0
            ? `已导出 ${fileName}，${redCount} 处尺寸不匹配已标红`
            : `已导出 ${fileName}`
        setStatus('ready')
        setLog(text)
        notify(text, 'info')
      } catch (error) {
        const message = `导出失败：${error instanceof Error ? error.message : String(error)}`
        notify(message, 'error')
        setStatus('error')
        setLog(message)
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
    prefs,
    savePrefs,
    detailFlags,
    drillFlags,
    busy,
    status,
    log,
    sourceRows: source?.rows.length ?? 0,
    sourceColumns: source?.columns.length ?? 0,
    pendingPath,
    pendingName,
    pendingUnloaded: pendingPath !== null && pendingPath !== loadedPath,
    queryInput,
    setQueryInput,
    loadCount,
    loadSource,
    sizeValidation,
    setSizeValidation,
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
