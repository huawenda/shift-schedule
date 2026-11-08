import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AppShell, type Route } from './components/AppShell'
import { DayEditor } from './components/DayEditor'
import { ScrollOverlay } from './components/ScrollOverlay'
import { ShiftEditor } from './components/ShiftEditor'
import type { MatrixMode } from './components/TeamMatrix'
import { Toaster } from './components/ui/sonner'
import { MatrixScreen } from './screens/MatrixScreen'
import { OverviewScreen } from './screens/OverviewScreen'
import { SettingsScreen, type SettingsTab } from './screens/SettingsScreen'
import { Wizard } from './screens/Wizard'
import {
  compareMonth,
  currentMonthKey,
  formatMonthTitle,
  monthKeyToString,
  parseMonthKey,
  shiftMonth,
  type MonthKey
} from './data/period'
import {
  createMemberId,
  emptyRoster,
  getDayRecord,
  getTemplateShift,
  isSelf,
  type DayRecordInput,
  type Member
} from './data/roster'
import { emptySalary, type SelfIdentity } from './data/profile'
import { formatOvertimeHours } from './data/overtime'
import { SHIFT_META, type ShiftType } from './data/shifts'
import { getCloseBehavior, syncCloseBehaviorToShell } from './platform/windowPrefs'
import { useBackupFlow } from './hooks/useBackupFlow'
import { useMonthNavigation } from './hooks/useMonthNavigation'
import { useRoster } from './hooks/useRoster'
import { useToasts } from './hooks/useToasts'

/** 从哪儿点开的格子：矩阵只能改班次，概览页的日历能记加班 */
type EditSource = 'matrix' | 'calendar'

/**
 * 应用内的完整位置：视图 + 结算月 + 设置页签，全部来自 hash。
 *
 * hash 格式（当前结算月省略月份前缀）：
 *   #/overview                #/2026-10/overview
 *   #/matrix                  #/2026-10/matrix
 *   #/settings/roster         #/2026-10/settings/profile
 *
 * 月份放在最前面而不是挂在某个视图上，是为了「切到设置再切回来」也保得住；
 * 当前月不写进 URL，默认地址保持干净，翻到别的月份才多出一段。
 */
interface AppLocation {
  route: Route
  /** null = 当前结算月（URL 里省略） */
  month: MonthKey | null
  settingsTab: SettingsTab
}

const DEFAULT_LOCATION: AppLocation = { route: 'overview', month: null, settingsTab: 'roster' }

/** 解析 hash；未知视图回落到概览，未知参数按「当前月 / 人员配置」处理 */
function parseLocation(hash: string): AppLocation {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  let month: MonthKey | null = null

  const head = parseMonthKey(parts[0] ?? '')
  if (head) {
    month = head
    parts.shift()
  }

  const [view, param] = parts

  if (view === 'matrix' || view === 'overview') {
    // 兼容旧式 `#/matrix/2026-10`：月份写在视图后面
    const trailing = param ? parseMonthKey(param) : null
    return { route: view, month: trailing ?? month, settingsTab: 'roster' }
  }

  if (view === 'settings') {
    return { route: 'settings', month, settingsTab: param === 'profile' ? 'profile' : 'roster' }
  }

  return { ...DEFAULT_LOCATION, month }
}

/** 生成规范 hash：当前月省略月份；设置页总是带页签 */
function buildHash(location: AppLocation): string {
  const prefix = location.month && compareMonth(location.month, currentMonthKey()) !== 0
    ? `/${monthKeyToString(location.month)}`
    : ''

  if (location.route === 'settings') return `#${prefix}/settings/${location.settingsTab}`
  return `#${prefix}/${location.route}`
}

/** 任务栏 / 原生标题栏：品牌 + 当前视图，避免和页面 H1 重复成两行同名 */
const ROUTE_TITLE: Record<Route, string> = {
  overview: '昼夜 · 月度概览',
  matrix: '昼夜 · 全员矩阵',
  settings: '昼夜 · 设置'
}

export function App() {
  const api = useRoster()
  const [location, setLocation] = useState<AppLocation>(() => parseLocation(window.location.hash))
  const route = location.route
  const settingsTab = location.settingsTab
  const [wizardSkipped, setWizardSkipped] = useState(false)
  const [editor, setEditor] = useState<{ memberId: string; date: string; source: EditSource } | null>(null)
  /**
   * 矩阵页的视图（按班次 / 按姓名）与分组筛选提到 App 里：
   * 矩阵组件在切页时会卸载，状态放这里才能「从其他页切回来保持上次选择」。
   * 只在内存里，刷新应用回默认。
   */
  const [matrixMode, setMatrixMode] = useState<MatrixMode>('shift')
  const [matrixGroup, setMatrixGroup] = useState<string | null>(null)
  /**
   * 三个一级页面各自的滚动位置。
   * 切 tab 时页面整块卸载重挂，滚动容器随之归零；离开前把滚动位置记下来，
   * 回来后再写回去，切页就不会把人从读到的位置弹回顶部。
   * 矩阵的日期区是 `.matrix-scroll` 自己在滚（横向 + 纵向），所以另外记两条。
   */
  const scrollPositions = useRef<Record<Route, { flow: number; matrixLeft: number; matrixTop: number }>>({
    overview: { flow: 0, matrixLeft: 0, matrixTop: 0 },
    matrix: { flow: 0, matrixLeft: 0, matrixTop: 0 },
    settings: { flow: 0, matrixLeft: 0, matrixTop: 0 }
  })

  /** 当前结算月固定到挂载时刻：跨过午夜不会自己翻月，刷新才更新，和原来的行为一致 */
  const currentMonth = useMemo(() => currentMonthKey(), [])
  const monthKey = useMemo(() => location.month ?? currentMonth, [location.month, currentMonth])
  const { period, atCurrentMonth } = useMonthNavigation(monthKey)
  const toast = useToasts()
  const { backup, restore } = useBackupFlow(api, toast)
  /** 存储不可写时那条常驻提示的 id，可写后撤掉 */
  const persistenceToast = useRef<number | null>(null)

  /**
   * hash 是唯一真相：路由、结算月、设置页签都从它解析。
   * 未知视图（如 #/foo）或旧格式（#/matrix/2026-10）会被原地改写成规范形式 ——
   * 用 replaceState 而不是赋值 hash，避免规范化本身多出一条历史。
   */
  useEffect(() => {
    function syncFromHash() {
      const next = parseLocation(window.location.hash)
      setLocation(next)
      const normalized = buildHash(next)
      if (window.location.hash && window.location.hash !== normalized) {
        window.history.replaceState(null, '', normalized)
      }
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  // 切回某个一级页面时恢复它上次的滚动位置。放在 layout 阶段写入，
  // 避免新页面先按顶部渲染一帧再跳回去。
  useLayoutEffect(() => {
    const saved = scrollPositions.current[route]
    const flow = document.querySelector<HTMLElement>('.canvas-flow')
    if (flow) flow.scrollTop = saved.flow

    const matrix = document.querySelector<HTMLElement>('.matrix-scroll')
    if (matrix) {
      matrix.scrollLeft = saved.matrixLeft
      matrix.scrollTop = saved.matrixTop
    }
  }, [route])

  // 标题跟随当前视图：浏览器标签页用 document.title，
  // 桌面壳用 Tauri 的窗口 API（任务栏显示的是原生标题，不会自动跟随 document.title）。
  useEffect(() => {
    const title = ROUTE_TITLE[route]
    document.title = title
    const appWindow = window.__TAURI__?.window?.getCurrentWindow?.()
    if (appWindow?.setTitle) void appWindow.setTitle(title).catch(() => {})
  }, [route])

  // 启动时把「关闭按钮」偏好同步给 Rust 侧，之后由设置页按需再同步。
  useEffect(() => {
    syncCloseBehaviorToShell(getCloseBehavior())
  }, [])

  // 存储不可写是持续状态：用一条常驻提示，恢复可写后自动撤掉。
  useEffect(() => {
    if (api.persisted) {
      if (persistenceToast.current !== null) {
        toast.dismiss(persistenceToast.current)
        persistenceToast.current = null
      }
      return
    }
    if (persistenceToast.current === null) {
      persistenceToast.current = toast.sticky('当前环境不能写入本机存储，改动刷新后会丢，请及时导出备份。', { tone: 'warning' })
    }
  }, [api.persisted, toast])

  /**
   * 唯一的路由入口：把新位置写进 hash，再同步 state。
   *
   * **应用内导航一律 replaceState，不压历史**：底部 tab、月份、设置页签
   * 都只是「当前应用内的位置变化」，不是一次页面跳转。系统返回键应当直接离开应用，
   * 而不是在浏览过的几个页面之间来回切（Android / iOS 的原生 app 都是这个行为）。
   * `month` 不传时沿用当前结算月；显式传 null 表示回到当前月。
   */
  const navigate = useCallback((nextRoute: Route, options: { month?: MonthKey | null; settingsTab?: SettingsTab } = {}) => {
    // 先记下当前页的滚动位置，再换路由：切 tab 回来时能回到离开处
    const flow = document.querySelector<HTMLElement>('.canvas-flow')
    const matrix = document.querySelector<HTMLElement>('.matrix-scroll')
    scrollPositions.current[location.route] = {
      flow: flow?.scrollTop ?? 0,
      matrixLeft: matrix?.scrollLeft ?? 0,
      matrixTop: matrix?.scrollTop ?? 0
    }

    const next: AppLocation = {
      route: nextRoute,
      month: 'month' in options ? (options.month ?? null) : (location.month ?? currentMonth),
      settingsTab: options.settingsTab ?? location.settingsTab
    }
    const hash = buildHash(next)

    if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
    setLocation(next)
  }, [location.route, location.month, location.settingsTab, currentMonth])

  function goMonth(delta: number) {
    navigate(location.route, { month: shiftMonth(monthKey, delta) })
  }

  function goToday() {
    navigate(location.route, { month: null })
  }

  function changeSettingsTab(tab: SettingsTab) {
    navigate('settings', { month: location.month, settingsTab: tab })
  }

  /** 直达「个人资料」页（侧栏点「设置」时用默认 tab，这里是显式指定） */
  const openProfileTab = useCallback(() => navigate('settings', { settingsTab: 'profile' }), [navigate])

  /** 侧栏链接带上当前月份，Cmd/Ctrl+点击开新标签也能落到同一个结算月 */
  const hrefs = useMemo<Record<Route, string>>(() => ({
    matrix: buildHash({ route: 'matrix', month: monthKey, settingsTab: 'roster' }),
    overview: buildHash({ route: 'overview', month: monthKey, settingsTab: 'roster' }),
    settings: buildHash({ route: 'settings', month: monthKey, settingsTab: 'roster' })
  }), [monthKey])

  function clearAll() {
    api.replaceRoster({ ...emptyRoster })
    setWizardSkipped(false)
    toast.info('已清空本机数据')
    navigate('overview')
  }

  function finishWizard(self: SelfIdentity, members: Member[]) {
    // 本人也是 members 里的一条，排在最前（矩阵与成员表都按数组顺序）
    const selfMember: Member = {
      id: createMemberId(),
      name: self.name,
      patternId: self.patternId
    }

    api.replaceRoster({
      members: [selfMember, ...members],
      groups: [],
      overrides: [],
      patterns: [],
      todos: [],
      profile: { memberId: selfMember.id, salary: { ...emptySalary } },
      updatedAt: Date.now()
    })

    setWizardSkipped(true)
    toast.info(`配置完成：本人 ${self.name} · 另有 ${members.length} 位同事`, { duration: 4000 })
    // 保留用户原本要去的页面：从 #/matrix 进来完成向导，仍落到矩阵
    navigate(location.route, { month: location.month })
  }

  function openEditor(member: Member, date: string, source: EditSource) {
    // 矩阵只改同事班次：本人的班次统一由个人日历管，两边不互相覆盖
    if (source === 'matrix' && isSelf(api.roster, member.id)) {
      toast.info('本人班次请在「月度概览」的日历里改')
      return
    }
    setEditor({ memberId: member.id, date, source })
  }

  /** 矩阵弹层：只改班次 */
  function applyShift(shift: ShiftType | null) {
    if (!editor) return
    const { memberId, date } = editor
    const previous = editorRecord
    api.editShift(memberId, date, shift)

    if (shift) {
      toast.info(`已保存：${SHIFT_META[shift].label}`)
    } else {
      // 恢复默认会清掉整条记录，给一个 5 秒撤销窗口
      toast.info(previous ? '已恢复为模板班次（加班/法定一并清空）' : '已恢复为模板班次', {
        duration: 5000,
        action: previous
          ? {
            label: '撤销',
            onClick: () => api.saveDay(memberId, date, {
              shift: previous.shift,
              overtimeHours: previous.overtimeHours,
              isLegal: previous.isLegal,
              leaveDuration: previous.leaveDuration
            })
          }
          : undefined
      })
    }
    setEditor(null)
  }

  /** 日历弹层：班次 + 加班 + 法定一起写 */
  function applyDay(input: DayRecordInput) {
    if (!editor) return
    api.saveDay(editor.memberId, editor.date, input)
    const extra = [
      input.overtimeHours ? `加班 ${formatOvertimeHours(input.overtimeHours)}` : '',
      input.isLegal ? '法定' : ''
    ].filter(Boolean)
    toast.info(
      extra.length > 0
        ? `已保存：${SHIFT_META[input.shift].label} · ${extra.join(' · ')}`
        : `已保存：${SHIFT_META[input.shift].label}`
    )
    setEditor(null)
  }

  function restoreDay() {
    if (!editor) return
    const { memberId, date } = editor
    const previous = editorRecord
    api.resetDay(memberId, date)
    toast.info('已恢复默认（班次、加班、法定一并清空）', {
      duration: 5000,
      action: previous
        ? {
          label: '撤销',
          onClick: () => api.saveDay(memberId, date, {
            shift: previous.shift,
            overtimeHours: previous.overtimeHours,
            isLegal: previous.isLegal,
            leaveDuration: previous.leaveDuration
          })
        }
        : undefined
    })
    setEditor(null)
  }

  const editorMember = editor ? api.roster.members.find(member => member.id === editor.memberId) ?? null : null
  const editorRecord = editor ? getDayRecord(api.roster, editor.memberId, editor.date) : undefined
  const editorTemplate = editorMember && editor ? getTemplateShift(api.roster, editorMember, editor.date) : null
  const editorShift = editorRecord?.shift ?? editorTemplate

  if (api.isEmpty && !wizardSkipped) {
    return <Wizard onFinish={finishWizard} onSkip={() => setWizardSkipped(true)} />
  }

  return (
    <>
      <ScrollOverlay />
      <AppShell
        atCurrentMonth={atCurrentMonth}
        hrefs={hrefs}
        monthTitle={formatMonthTitle(monthKey)}
        route={route}
        onBackup={backup}
        onNavigate={next => {
          // 设置页签沿用上次停留的那一页（与小程序页面缓存一致）；首次进入仍是人员配置
          navigate(next)
        }}
        onRestore={file => void restore(file)}
        onShiftMonth={goMonth}
        onToday={goToday}
      >
        {route === 'settings' ? (
          <SettingsScreen
            tab={settingsTab}
            onTabChange={changeSettingsTab}
            roster={api.roster}
            onNotify={toast.info}
            onBackup={backup}
            onClearAll={clearAll}
            onRemovePattern={api.removePatternById}
            onRestore={file => void restore(file)}
            onSaveSalary={api.saveSalary}
            onSaveMembers={api.replaceMembers}
            onSaveGroup={api.saveGroup}
            onRemoveGroup={api.removeGroupById}
            onSavePattern={api.savePattern}
            onSaveSelf={api.saveSelf}
            onStartWizard={() => {
              setWizardSkipped(false)
              navigate('overview')
            }}
          />
        ) : route === 'matrix' ? (
          <MatrixScreen
            groupFilter={matrixGroup}
            mode={matrixMode}
            period={period}
            roster={api.roster}
            onEdit={(member, date) => openEditor(member, date, 'matrix')}
            onGroupFilterChange={setMatrixGroup}
            onModeChange={setMatrixMode}
          />
        ) : (
          <OverviewScreen
            period={period}
            roster={api.roster}
            onEdit={(member, date) => openEditor(member, date, 'calendar')}
            onToggleTodo={api.toggleTodo}
            onOpenProfile={openProfileTab}
          />
        )}
      </AppShell>

      {editor && editorMember ? (
        editor.source === 'calendar' ? (
          <DayEditor
            currentShift={editorShift}
            date={editor.date}
            member={editorMember}
            record={editorRecord}
            templateShift={editorTemplate}
            todos={api.roster.todos.filter(todo => todo.date === editor.date)}
            onAddTodo={text => api.addTodo(editor.date, text)}
            onApply={applyDay}
            onClose={() => setEditor(null)}
            onRemoveTodo={api.removeTodo}
            onRestore={restoreDay}
            onToggleTodo={api.toggleTodo}
          />
        ) : (
          <ShiftEditor
            currentShift={editorShift}
            date={editor.date}
            member={editorMember}
            record={editorRecord}
            templateShift={editorTemplate}
            onApply={applyShift}
            onClose={() => setEditor(null)}
          />
        )
      ) : null}

      {/* sonner：堆叠、悬停暂停、aria-live 都是内建的，不再需要自研 ToastHost */}
      <Toaster position="bottom-center" />
    </>
  )
}
