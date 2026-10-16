import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  calculateSalary,
  emptySalaryInputs,
  getCurrentScheduleMonth,
  getMonthScheduleView,
  getOvertimeChartItems,
  getOverrideKey,
  getPersonMonthlyStats,
  getPersonShiftSummary,
  normalizeLegalOverride,
  normalizeOvertimeHours,
  scheduleData,
  type LeaveDuration,
  type SalaryInputValues,
  type ScheduleMonth,
  type ShiftType
} from '@local/core'
import { AppChrome } from './components/AppChrome'
import { ScheduleView } from './features/schedule/ScheduleView'
import { ShiftEditorModal } from './features/schedule/ShiftEditorModal'
import { StatsView } from './features/stats/StatsView'
import { useBackDismiss } from './hooks/useBackDismiss'
import { defaultCurrentUserName } from './appConstants'
import type { SalaryInputField, SalarySaveStatus, ShiftEditorState } from './appTypes'
import {
  applyRecordToOverrides,
  canRecordOvertime,
  deleteRecordFromOverrides,
  getBaseShift,
  getEditorEffectiveShift,
  getOvertimeHoursByType
} from './scheduleHelpers'
import { downloadBackup, restoreBackup } from './services/backup'
import {
  deleteDayRecord,
  emptyDayOverrides,
  loadDayOverrides,
  saveDayRecord,
  type CloudDayRecord,
  type DayOverrides
} from './services/dayRecords'
import {
  getSalaryInputKey,
  loadSalaryInputs,
  saveSalaryInput,
  type SalaryInputRecords
} from './services/salaryInputs'
import { isLocalPersistenceAvailable, readLocalSettings, writeLocalSettings } from './services/localStore'

type AppView = 'schedule' | 'stats'

const scheduleHash = '#/schedule'
const statsHash = '#/stats'

function readViewFromHash(): AppView {
  return window.location.hash.startsWith(statsHash) ? 'stats' : 'schedule'
}

/** 月份/人员放进 query，保证状态可深链、刷新不丢（见 DESIGN.local.md「状态入 URL」）。 */
function readHashParams() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  return {
    month: (params.get('month') ?? '') as ScheduleMonth,
    person: params.get('person') ?? ''
  }
}

function writeHash(view: AppView, month: ScheduleMonth, person: string) {
  const next = `#/${view}?month=${month}&person=${encodeURIComponent(person)}`
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next)
  }
}

function isValidMonth(value: string): value is ScheduleMonth {
  return ['05', '06', '07', '08', '09', '10', '11', '12'].includes(value)
}

export function App() {
  const [view, setView] = useState<AppView>(readViewFromHash)
  const [selectedMonth, setSelectedMonth] = useState<ScheduleMonth>(
    () => {
      const fromUrl = readHashParams().month
      if (isValidMonth(fromUrl)) return fromUrl
      return getCurrentScheduleMonth(scheduleData) ?? '06'
    }
  )
  const [schedulePersonName, setSchedulePersonName] = useState(
    () => readHashParams().person || readLocalSettings().personName || defaultCurrentUserName
  )
  const [overrides, setOverrides] = useState<DayOverrides>(emptyDayOverrides)
  const [salaryInputRecords, setSalaryInputRecords] = useState<SalaryInputRecords>({})
  const [isBooting, setIsBooting] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSavingRecord, setIsSavingRecord] = useState(false)
  const [salarySaveStatus, setSalarySaveStatus] = useState<SalarySaveStatus>('idle')
  const [shiftEditor, setShiftEditor] = useState<ShiftEditorState | null>(null)
  const [isPersonPickerOpen, setIsPersonPickerOpen] = useState(false)
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null)
  const [statusText, setStatusText] = useState('本地模式')
  const [errorText, setErrorText] = useState('')

  const isStatsRoute = view === 'stats'
  const canPersist = useMemo(() => isLocalPersistenceAvailable(), [])

  useBackDismiss(Boolean(shiftEditor) || isPersonPickerOpen, () => {
    setShiftEditor(null)
    setIsPersonPickerOpen(false)
  })

  useEffect(() => {
    const handleHashChange = () => setView(readViewFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    writeLocalSettings({ personName: schedulePersonName })
    writeHash(view, selectedMonth, schedulePersonName)
  }, [schedulePersonName, selectedMonth, view])

  const monthView = useMemo(() => getMonthScheduleView(scheduleData, selectedMonth), [selectedMonth])
  const currentUser = monthView.people.find(person => person.name === schedulePersonName) ?? monthView.people[0]
  const appliedMonthView = useMemo(() => ({
    ...monthView,
    people: monthView.people.map(person => ({
      ...person,
      shifts: person.shifts.map((shift, index) => (
        overrides.shiftOverrides[getOverrideKey(person.name, monthView.dates[index])] ?? shift
      ))
    }))
  }), [monthView, overrides.shiftOverrides])

  const appliedCurrentUser = appliedMonthView.people.find(person => person.name === currentUser.name) ?? appliedMonthView.people[0]
  const legalFlags = appliedMonthView.dates.map(date => overrides.legalOverrides[getOverrideKey(appliedCurrentUser.name, date)] === true)
  const overtimeHours = appliedMonthView.dates.map(date => overrides.overtimeOverrides[getOverrideKey(appliedCurrentUser.name, date)] ?? 0)
  const summary = getPersonShiftSummary(appliedCurrentUser, overtimeHours, legalFlags)

  const statsPerson = scheduleData.people.find(person => person.name === schedulePersonName) ?? appliedCurrentUser
  const personalStats = getPersonMonthlyStats(
    appliedMonthView,
    statsPerson.name,
    overrides.overtimeOverrides,
    overrides.shiftOverrides,
    overrides.legalOverrides,
    overrides.leaveDurationOverrides
  )
  const overtimeChartItems = personalStats ? getOvertimeChartItems(personalStats.shiftSummary.加班) : []
  const overtimeChartMax = Math.max(...overtimeChartItems.map(item => item.hours), 0)

  const salaryInputKey = getSalaryInputKey(statsPerson.name, selectedMonth)
  const salaryInputs = salaryInputRecords[salaryInputKey] ?? emptySalaryInputs
  const salaryCalculation = calculateSalary(salaryInputs, {
    weekdayHours: getOvertimeHoursByType(overtimeChartItems, '平日'),
    specialHours: getOvertimeHoursByType(overtimeChartItems, '特勤'),
    legalHours: getOvertimeHoursByType(overtimeChartItems, '法定'),
    leaveHours: personalStats?.leaveSummary.hours ?? 0
  })

  useEffect(() => {
    void boot()
  }, [])

  async function boot() {
    setIsBooting(true)
    setErrorText('')
    try {
      await refreshLocalData('本地模式')
    } finally {
      setIsBooting(false)
    }
  }

  async function refreshLocalData(successText = '已读取本地数据', includeSalary = isStatsRoute) {
    setIsRefreshing(true)
    setErrorText('')
    try {
      const [nextOverrides, nextSalaryInputs] = await Promise.all([
        loadDayOverrides(),
        includeSalary ? loadSalaryInputs() : Promise.resolve<SalaryInputRecords | null>(null)
      ])
      setOverrides(nextOverrides)
      if (nextSalaryInputs) setSalaryInputRecords(nextSalaryInputs)
      setStatusText(successText)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '读取本地数据失败')
      setStatusText('读取失败')
    } finally {
      setIsRefreshing(false)
    }
  }

  function openStatsRoute() {
    void refreshLocalData('统计数据已读取', true)
    if (readViewFromHash() !== 'stats') window.location.hash = statsHash
    setView('stats')
  }

  function backToSchedule() {
    setView('schedule')
    if (readViewFromHash() === 'stats') {
      try {
        window.location.replace(scheduleHash)
      } catch {
        window.location.hash = scheduleHash
      }
    }
  }

  function exportBackup() {
    try {
      setErrorText('')
      setStatusText(`已导出 ${downloadBackup()}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导出备份失败')
    }
  }

  async function importBackup(file: File) {
    if (!window.confirm('导入备份会覆盖这台设备上现有的排班记录，确定继续吗？')) return

    setErrorText('')
    setStatusText('正在导入备份…')
    try {
      const result = restoreBackup(await file.text())
      await refreshLocalData(`已恢复 ${result.dayRecords} 条排班记录`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导入备份失败')
      setStatusText('导入备份失败')
    }
  }

  async function setSalaryInputValue(field: SalaryInputField, value: string) {
    const nextValues = { ...salaryInputs, [field]: value }

    setSalaryInputRecords(records => ({ ...records, [salaryInputKey]: nextValues }))
    setSalarySaveStatus('saving')
    setErrorText('')

    try {
      await saveSalaryInput(salaryInputKey, nextValues)
      setSalarySaveStatus('saved')
      setStatusText('薪资已保存到本机')
    } catch (error) {
      setSalarySaveStatus('error')
      setErrorText(error instanceof Error ? error.message : '薪资保存失败')
      setStatusText('薪资保存失败')
    }
  }

  function openShiftEditor(personName: string, date: string) {
    const baseShift = getBaseShift(personName, date)
    if (!baseShift) return

    const key = getOverrideKey(personName, date)
    setShiftEditor({
      personName,
      date,
      baseShift,
      selectedShift: overrides.shiftOverrides[key] ?? 'default',
      overtimeInput: overrides.overtimeOverrides[key]?.toString() ?? '',
      isLegal: overrides.legalOverrides[key] === true,
      leaveDuration: overrides.leaveDurationOverrides[key] ?? '一天'
    })
    setErrorText('')
  }

  function selectShiftEdit(nextShift: ShiftType | 'default') {
    setShiftEditor(editor => {
      if (!editor) return editor
      const effectiveShift = nextShift === 'default' ? editor.baseShift : nextShift
      return {
        ...editor,
        selectedShift: nextShift,
        isLegal: normalizeLegalOverride(effectiveShift, editor.isLegal),
        leaveDuration: effectiveShift === '事假' ? editor.leaveDuration : '一天'
      }
    })
  }

  function setShiftEditorLegal(isLegal: boolean) {
    setShiftEditor(editor => {
      if (!editor) return editor
      return { ...editor, isLegal: normalizeLegalOverride(getEditorEffectiveShift(editor), isLegal) }
    })
  }

  const flashCell = useCallback((key: string) => {
    setConfirmedKey(key)
    window.setTimeout(() => setConfirmedKey(current => (current === key ? null : current)), 500)
  }, [])

  async function saveShiftEditor() {
    if (!shiftEditor || isSavingRecord) return

    const resolvedShift = getEditorEffectiveShift(shiftEditor)
    const shouldUseBaseShift = resolvedShift === shiftEditor.baseShift
    const hours = canRecordOvertime(resolvedShift) ? normalizeOvertimeHours(shiftEditor.overtimeInput) : 0
    const isLegalOvertime = normalizeLegalOverride(resolvedShift, shiftEditor.isLegal)
    const leaveDuration = resolvedShift === '事假' ? shiftEditor.leaveDuration : undefined
    const shouldDelete = shouldUseBaseShift && hours <= 0 && !isLegalOvertime && !leaveDuration

    setIsSavingRecord(true)
    setErrorText('')
    setStatusText('保存中…')

    try {
      if (shouldDelete) {
        await deleteDayRecord(shiftEditor.personName, shiftEditor.date)
        setOverrides(current => deleteRecordFromOverrides(current, shiftEditor.personName, shiftEditor.date))
      } else {
        const record: CloudDayRecord = {
          personName: shiftEditor.personName,
          date: shiftEditor.date,
          ...(!shouldUseBaseShift ? { shiftOverride: resolvedShift } : {}),
          overtimeHours: hours,
          ...(isLegalOvertime ? { isLegalOvertime } : {}),
          ...(leaveDuration ? { leaveDuration } : {})
        }
        await saveDayRecord(record)
        setOverrides(current => applyRecordToOverrides(current, record, shiftEditor.baseShift))
      }

      setShiftEditor(null)
      setStatusText('已保存到本机')
      flashCell(getOverrideKey(shiftEditor.personName, shiftEditor.date))
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存失败，请稍后重试')
      setStatusText('保存失败')
    } finally {
      setIsSavingRecord(false)
    }
  }

  return (
    <main className="app-shell">
      {isStatsRoute ? (
        <StatsView
          isRefreshing={isRefreshing}
          monthEndDate={monthView.endDate}
          monthStartDate={monthView.startDate}
          overtimeChartItems={overtimeChartItems}
          overtimeChartMax={overtimeChartMax}
          personalStats={personalStats}
          salaryCalculation={salaryCalculation}
          salaryInputs={salaryInputs}
          salarySaveStatus={salarySaveStatus}
          selectedMonth={selectedMonth}
          onBack={backToSchedule}
          onMonthChange={setSelectedMonth}
          onRefresh={() => void refreshLocalData('统计数据已读取', true)}
          onSalaryInputChange={(field, value) => void setSalaryInputValue(field, value)}
        />
      ) : (
        <ScheduleView
          appliedCurrentUser={appliedCurrentUser}
          appliedMonthView={appliedMonthView}
          chrome={(
            <AppChrome
              endDate={monthView.endDate}
              isBooting={isBooting}
              isRefreshing={isRefreshing}
              personGroup={currentUser.group}
              personName={currentUser.name}
              selectedMonth={selectedMonth}
              startDate={monthView.startDate}
              onExportBackup={exportBackup}
              onImportBackup={file => void importBackup(file)}
              onMonthChange={setSelectedMonth}
              onOpenPersonPicker={() => setIsPersonPickerOpen(true)}
              onOpenStats={openStatsRoute}
              onRefresh={() => void refreshLocalData('已读取本地数据')}
            />
          )}
          confirmedKey={confirmedKey}
          errorText={errorText}
          isAdmin
          isPersonPickerOpen={isPersonPickerOpen}
          overrides={overrides}
          people={appliedMonthView.people}
          selectedMonth={selectedMonth}
          statusText={statusText}
          summary={summary}
          warningText={canPersist ? undefined : '当前浏览器不允许本机存储，改动只保留在内存里，刷新就会丢失。请用顶栏「导出」及时保存。'}
          onCurrentUserChange={setSchedulePersonName}
          onMonthChange={setSelectedMonth}
          onOpenShiftEditor={openShiftEditor}
          onPersonPickerClose={() => setIsPersonPickerOpen(false)}
        />
      )}

      {shiftEditor ? (
        <ShiftEditorModal
          editor={shiftEditor}
          isSavingRecord={isSavingRecord}
          onCancel={() => setShiftEditor(null)}
          onLeaveDurationChange={(duration: LeaveDuration) =>
            setShiftEditor(editor => (editor ? { ...editor, leaveDuration: duration } : editor))}
          onLegalChange={setShiftEditorLegal}
          onOvertimeInputChange={value =>
            setShiftEditor(editor => (editor ? { ...editor, overtimeInput: value } : editor))}
          onSave={() => void saveShiftEditor()}
          onShiftChange={selectShiftEdit}
        />
      ) : null}
    </main>
  )
}