import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell, type Route } from './components/Shell'
import { DayEditor } from './components/DayEditor'
import { ShiftEditor } from './components/ShiftEditor'
import { ScheduleScreen, type EditSource, type ScheduleView } from './screens/ScheduleScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { Wizard } from './screens/Wizard'
import { downloadBackup, parseBackup } from './data/backup'
import { currentMonthKey, formatMonthTitle, getPeriod, shiftMonth, type MonthKey } from './data/period'
import {
  emptyRoster,
  getDayRecord,
  getTemplateShift,
  type DayRecordInput,
  type Member
} from './data/roster'
import { formatOvertimeHours } from './data/overtime'
import { SHIFT_META, type ShiftType } from './data/shifts'
import { useRoster } from './hooks/useRoster'

function readRoute(): Route {
  return window.location.hash.startsWith('#/settings') ? 'settings' : 'schedule'
}

export function App() {
  const api = useRoster()
  const [route, setRoute] = useState<Route>(readRoute)
  const [monthKey, setMonthKey] = useState<MonthKey>(() => currentMonthKey())
  const [view, setView] = useState<ScheduleView>('matrix')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
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

  // 选中的成员被删掉时，自动回落到第一个
  useEffect(() => {
    const exists = api.roster.members.some(member => member.id === selectedMemberId)
    if (!exists) setSelectedMemberId(api.roster.members[0]?.id ?? null)
  }, [api.roster.members, selectedMemberId])

  const navigate = useCallback((next: Route) => {
    setRoute(next)
    const target = next === 'settings' ? '#/settings' : '#/schedule'
    if (window.location.hash !== target) window.location.hash = target
  }, [])

  const goMonth = useCallback((delta: number) => {
    setMonthKey(current => shiftMonth(current, delta))
  }, [])

  function backup() {
    try {
      const fileName = downloadBackup(api.roster)
      setStatusText(`已导出 ${fileName}`)
    } catch {
      setStatusText('导出失败')
    }
  }

  async function restore(file: File) {
    setStatusText('正在导入…')
    try {
      const result = parseBackup(await file.text())
      api.replaceRoster(result.roster)
      setSelectedMemberId(result.roster.members[0]?.id ?? null)
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
    setSelectedMemberId(null)
    setWizardSkipped(false)
    setNotice('')
    setStatusText('已清空本机数据')
    navigate('schedule')
  }

  function finishWizard(members: Member[]) {
    api.replaceRoster({ members, overrides: [], patterns: [], updatedAt: Date.now() })
    setSelectedMemberId(members[0]?.id ?? null)
    setWizardSkipped(true)
    setStatusText(`配置完成：${members.length} 位成员`)
    navigate('schedule')
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
      <Shell
        memberCount={api.roster.members.length}
        monthTitle={formatMonthTitle(monthKey)}
        notice={notice ? { text: notice, onDismiss: () => setNotice('') } : undefined}
        route={route}
        statusText={statusText}
        warning={api.persisted ? undefined : '不能写入本机存储'}
        onBackup={backup}
        onNavigate={navigate}
        onRestore={file => void restore(file)}
        onShiftMonth={goMonth}
        onToday={() => setMonthKey(currentMonthKey())}
      >
        {route === 'settings' ? (
          <SettingsScreen
            persisted={api.persisted}
            roster={api.roster}
            onBackup={backup}
            onClearAll={clearAll}
            onRemovePattern={api.removePatternById}
            onRestore={file => void restore(file)}
            onSaveMembers={api.replaceMembers}
            onSavePattern={api.savePattern}
            onStartWizard={() => {
              setWizardSkipped(false)
              navigate('schedule')
            }}
          />
        ) : (
          <ScheduleScreen
            period={period}
            roster={api.roster}
            selectedMemberId={selectedMemberId}
            view={view}
            onEdit={openEditor}
            onSelectMember={setSelectedMemberId}
            onViewChange={setView}
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
            onApply={applyDay}
            onClose={() => setEditor(null)}
            onRestore={restoreDay}
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
