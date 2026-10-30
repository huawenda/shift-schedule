import { useCallback, useEffect, useRef, useState } from 'react'
import { Shell, type Route } from './components/Shell'
import { DayEditor } from './components/DayEditor'
import { ScrollOverlay } from './components/ScrollOverlay'
import { ShiftEditor } from './components/ShiftEditor'
import { ToastHost } from './components/ToastHost'
import { MatrixScreen } from './screens/MatrixScreen'
import { OverviewScreen } from './screens/OverviewScreen'
import { SettingsScreen, type SettingsTab } from './screens/SettingsScreen'
import { Wizard } from './screens/Wizard'
import { formatMonthTitle } from './data/period'
import {
  createMemberId,
  emptyRoster,
  getDayRecord,
  getTemplateShift,
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

function readRoute(): Route {
  if (window.location.hash.startsWith('#/settings')) return 'settings'
  if (window.location.hash.startsWith('#/matrix')) return 'matrix'
  return 'overview'
}

function routeHash(route: Route): string {
  if (route === 'settings') return '#/settings'
  if (route === 'matrix') return '#/matrix'
  return '#/overview'
}

/** 任务栏 / 浏览器标签页直接显示当前视图名，不再带应用名前缀 */
const ROUTE_TITLE: Record<Route, string> = {
  overview: '月度概览',
  matrix: '全员矩阵',
  settings: '设置'
}

export function App() {
  const api = useRoster()
  const [route, setRoute] = useState<Route>(readRoute)
  /** 进设置页时落在哪个 tab：从「月度概览」的薪资空态点进去时直接到个人资料 */
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('roster')
  const [wizardSkipped, setWizardSkipped] = useState(false)
  const [editor, setEditor] = useState<{ memberId: string; date: string; source: EditSource } | null>(null)

  const { monthKey, period, goMonth, goToday, atCurrentMonth } = useMonthNavigation()
  const toast = useToasts()
  const { backup, restore } = useBackupFlow(api, toast)
  /** 存储不可写时那条常驻提示的 id，可写后撤掉 */
  const persistenceToast = useRef<number | null>(null)

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

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

  const navigate = useCallback((next: Route) => {
    setRoute(next)
    const target = routeHash(next)
    if (window.location.hash !== target) window.location.hash = target
  }, [])

  /** 直达「个人资料」页（侧栏点「设置」时用默认 tab，这里是显式指定） */
  const openProfileTab = useCallback(() => {
    setSettingsTab('profile')
    navigate('settings')
  }, [navigate])

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
      overrides: [],
      patterns: [],
      todos: [],
      profile: { memberId: selfMember.id, salary: { ...emptySalary } },
      updatedAt: Date.now()
    })

    setWizardSkipped(true)
    toast.info(`配置完成：本人 ${self.name} · 另有 ${members.length} 位同事`, { duration: 4000 })
    navigate('overview')
  }

  function openEditor(member: Member, date: string, source: EditSource) {
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
      <Shell
        memberCount={api.roster.members.length}
        monthTitle={formatMonthTitle(monthKey)}
        atCurrentMonth={atCurrentMonth}
        route={route}
        onBackup={backup}
        onNavigate={next => {
          if (next === 'settings') setSettingsTab('roster')
          navigate(next)
        }}
        onRestore={file => void restore(file)}
        onShiftMonth={goMonth}
        onToday={goToday}
      >
        {route === 'settings' ? (
          <SettingsScreen
            initialTab={settingsTab}
            roster={api.roster}
            onNotify={toast.info}
            onBackup={backup}
            onClearAll={clearAll}
            onRemovePattern={api.removePatternById}
            onRestore={file => void restore(file)}
            onSaveSalary={api.saveSalary}
            onSaveMembers={api.replaceMembers}
            onSavePattern={api.savePattern}
            onSaveSelf={api.saveSelf}
            onStartWizard={() => {
              setWizardSkipped(false)
              navigate('overview')
            }}
          />
        ) : route === 'matrix' ? (
          <MatrixScreen
            period={period}
            roster={api.roster}
            onEdit={(member, date) => openEditor(member, date, 'matrix')}
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
      </Shell>

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

      <ToastHost
        toasts={toast.toasts}
        onDismiss={toast.dismiss}
        onPause={toast.pause}
        onResume={toast.resume}
      />
    </>
  )
}
