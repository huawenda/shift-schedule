import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell, type Route } from './components/Shell'
import { DayEditor } from './components/DayEditor'
import { ScrollOverlay } from './components/ScrollOverlay'
import { ShiftEditor } from './components/ShiftEditor'
import { MatrixScreen } from './screens/MatrixScreen'
import { OverviewScreen } from './screens/OverviewScreen'
import { SettingsScreen, type SettingsTab } from './screens/SettingsScreen'
import { Wizard } from './screens/Wizard'
import { backupText, buildBackupFileName, downloadBackup, parseBackup } from './data/backup'
import { canChooseBackupDir, getBackupDir, writeBackupFile } from './data/backupDir'
import { currentMonthKey, formatMonthTitle, getPeriod, shiftMonth, type MonthKey } from './data/period'
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
import { useRoster } from './hooks/useRoster'

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

export function App() {
  const api = useRoster()
  const [route, setRoute] = useState<Route>(readRoute)
  const [monthKey, setMonthKey] = useState<MonthKey>(() => currentMonthKey())
  /** 进设置页时落在哪个 tab：从「月度概览」的薪资空态点进去时直接到个人资料 */
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('roster')
  const [wizardSkipped, setWizardSkipped] = useState(false)
  const [editor, setEditor] = useState<{ memberId: string; date: string; source: EditSource } | null>(null)
  const [statusText, setStatusText] = useState('数据已就绪')
  const [notice, setNotice] = useState('')

  const period = useMemo(() => getPeriod(monthKey), [monthKey])

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

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

  const goMonth = useCallback((delta: number) => {
    setMonthKey(current => shiftMonth(current, delta))
  }, [])

  async function backup() {
    const fileName = buildBackupFileName(new Date())
    const dir = getBackupDir()

    // 壳里且设过目录 → 直接写进去。用户挑的地方才是真·「默认存放位置」，
    // 这时再退回下载夹会让人以为文件跑到别处去了。
    if (dir && canChooseBackupDir()) {
      try {
        const saved = await writeBackupFile(dir, fileName, backupText(api.roster))
        setStatusText(`已导出到 ${saved}`)
        return
      } catch (error) {
        setStatusText(`导出失败：${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }

    try {
      const downloaded = downloadBackup(api.roster)
      setStatusText(`已导出 ${downloaded}`)
    } catch {
      setStatusText('导出失败')
    }
  }

  async function restore(file: File) {
    setStatusText('正在导入…')
    try {
      const result = parseBackup(await file.text())
      api.replaceRoster(result.roster)
      setStatusText('导入完成')

      const base = `已导入 ${result.memberCount} 位成员、${result.overrideCount} 条记录`
      setNotice(
        result.droppedMembers.length > 0
          ? `${base}；另有 ${result.droppedMembers.length} 位成员的班序在备份里不存在，未能恢复：${result.droppedMembers.join('、')}`
          : base
      )
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '导入失败')
    }
  }

  function clearAll() {
    api.replaceRoster({ ...emptyRoster })
    setWizardSkipped(false)
    setNotice('')
    setStatusText('已清空本机数据')
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
    setStatusText(`配置完成：本人 ${self.name} · 另有 ${members.length} 位同事`)
    navigate('overview')
  }

  function openEditor(member: Member, date: string, source: EditSource) {
    setEditor({ memberId: member.id, date, source })
  }

  /** 矩阵弹层：只改班次 */
  function applyShift(shift: ShiftType | null) {
    if (!editor) return
    api.editShift(editor.memberId, editor.date, shift)
    setStatusText(shift ? `已保存：${SHIFT_META[shift].label}` : '已恢复为模板班次')
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
    setStatusText(
      extra.length > 0
        ? `已保存：${SHIFT_META[input.shift].label} · ${extra.join(' · ')}`
        : `已保存：${SHIFT_META[input.shift].label}`
    )
    setEditor(null)
  }

  function restoreDay() {
    if (!editor) return
    api.resetDay(editor.memberId, editor.date)
    setStatusText('已恢复默认（班次、加班、法定一并清空）')
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
        atCurrentMonth={
          // MonthKey 是 { year, month } 对象，比引用永远 false，必须逐字段比
          monthKey.year === currentMonthKey().year && monthKey.month === currentMonthKey().month
        }
        notice={notice ? { text: notice, onDismiss: () => setNotice('') } : undefined}
        route={route}
        statusText={statusText}
        warning={api.persisted ? undefined : '不能写入本机存储'}
        onBackup={backup}
        onNavigate={next => {
          if (next === 'settings') setSettingsTab('roster')
          navigate(next)
        }}
        onRestore={file => void restore(file)}
        onShiftMonth={goMonth}
        onToday={() => setMonthKey(currentMonthKey())}
      >
        {route === 'settings' ? (
          <SettingsScreen
            initialTab={settingsTab}
            persisted={api.persisted}
            roster={api.roster}
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
    </>
  )
}
