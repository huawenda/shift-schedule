import { useEffect, useMemo, useState } from 'react'
import {
  calculateSalary,
  emptySalaryInputs,
  getAllPeopleMonthlyOvertimeStats,
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
import type { SalaryInputField, SalarySaveStatus, ShiftEditorState, StatsViewMode } from './appTypes'
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

function getInitialPersonName(): string {
  return readLocalSettings().personName || defaultCurrentUserName
}

function getInitialMonth(): ScheduleMonth {
  return getCurrentScheduleMonth(scheduleData) ?? '06'
}

export function App() {
  const [view, setView] = useState<AppView>(readViewFromHash)
  const [selectedMonth, setSelectedMonth] = useState<ScheduleMonth>(getInitialMonth)
  const [schedulePersonName, setSchedulePersonName] = useState(getInitialPersonName)
  const [statsPersonName, setStatsPersonName] = useState(getInitialPersonName)
  const [statsViewMode, setStatsViewMode] = useState<StatsViewMode>('personal')
  const [overrides, setOverrides] = useState<DayOverrides>(emptyDayOverrides)
  const [salaryInputRecords, setSalaryInputRecords] = useState<SalaryInputRecords>({})
  const [isBooting, setIsBooting] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSavingRecord, setIsSavingRecord] = useState(false)
  const [salarySaveStatus, setSalarySaveStatus] = useState<SalarySaveStatus>('idle')
  const [shiftEditor, setShiftEditor] = useState<ShiftEditorState | null>(null)
  const [statusText, setStatusText] = useState('本地模式')
  const [errorText, setErrorText] = useState('')

  const isStatsRoute = view === 'stats'
  const canPersist = useMemo(() => isLocalPersistenceAvailable(), [])

  useBackDismiss(Boolean(shiftEditor), () => setShiftEditor(null))

  // 用 hash 做两个页面之间的切换：file:// 下也能用，而且系统返回手势可以回到排班页。
  useEffect(() => {
    const handleHashChange = () => setView(readViewFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 记住上次看的是谁，下次打开还是这个人
  useEffect(() => {
    writeLocalSettings({ personName: schedulePersonName })
  }, [schedulePersonName])

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
  const currentUserLegalFlags = appliedMonthView.dates.map(date => overrides.legalOverrides[getOverrideKey(appliedCurrentUser.name, date)] === true)
  const currentUserOvertimeHours = appliedMonthView.dates.map(date => overrides.overtimeOverrides[getOverrideKey(appliedCurrentUser.name, date)] ?? 0)
  const summary = getPersonShiftSummary(appliedCurrentUser, currentUserOvertimeHours, currentUserLegalFlags)
  const statsPerson = scheduleData.people.find(person => person.name === statsPersonName) ?? appliedCurrentUser
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
  const teamStats = getAllPeopleMonthlyOvertimeStats(
    appliedMonthView,
    overrides.overtimeOverrides,
    overrides.shiftOverrides,
    overrides.legalOverrides
  )
  const teamChartMax = Math.max(...teamStats.people.map(person => person.totalHours), 0)

  useEffect(() => {
    void boot()
  }, [])

  async function boot() {
    setIsBooting(true)
    setErrorText('')
    setStatusText('本地模式')

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
    if (readViewFromHash() !== 'stats') {
      // 产生一条历史记录，系统返回手势可以回到排班页
      window.location.hash = statsHash
    }
    setView('stats')
  }

  function backToSchedule() {
    setView('schedule')
    if (readViewFromHash() === 'stats') {
      try {
        // replace 不新增历史记录，避免「返回 → 又回到统计页」
        window.location.replace(scheduleHash)
      } catch {
        window.location.hash = scheduleHash
      }
    }
  }

  function exportBackup() {
    try {
      const fileName = downloadBackup()
      setErrorText('')
      setStatusText(`已导出 ${fileName}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导出备份失败')
    }
  }

  async function importBackup(file: File) {
    if (!window.confirm('导入备份会覆盖这台设备上现有的排班记录，确定继续吗？')) return

    setErrorText('')
    setStatusText('正在导入备份')

    try {
      const result = restoreBackup(await file.text())
      await refreshLocalData(`已恢复 ${result.dayRecords} 条排班记录`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导入备份失败')
      setStatusText('导入备份失败')
    }
  }

  async function setSalaryInputValue(field: SalaryInputField, value: string) {
    const nextValues = {
      ...salaryInputs,
      [field]: value
    }

    setSalaryInputRecords(records => ({
      ...records,
      [salaryInputKey]: nextValues
    }))
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
      return {
        ...editor,
        isLegal: normalizeLegalOverride(getEditorEffectiveShift(editor), isLegal)
      }
    })
  }

  async function saveShiftEditor() {
    if (!shiftEditor || isSavingRecord) return

    const resolvedShift = getEditorEffectiveShift(shiftEditor)
    const shouldUseBaseShift = resolvedShift === shiftEditor.baseShift
    const overtimeHours = canRecordOvertime(resolvedShift)
      ? normalizeOvertimeHours(shiftEditor.overtimeInput)
      : 0
    const isLegalOvertime = normalizeLegalOverride(resolvedShift, shiftEditor.isLegal)
    const leaveDuration = resolvedShift === '事假' ? shiftEditor.leaveDuration : undefined
    const shouldDeleteRecord = shouldUseBaseShift && overtimeHours <= 0 && !isLegalOvertime && !leaveDuration

    setIsSavingRecord(true)
    setErrorText('')
    setStatusText('保存中')

    try {
      if (shouldDeleteRecord) {
        await deleteDayRecord(shiftEditor.personName, shiftEditor.date)
        setOverrides(current => deleteRecordFromOverrides(current, shiftEditor.personName, shiftEditor.date))
      } else {
        const record: CloudDayRecord = {
          personName: shiftEditor.personName,
          date: shiftEditor.date,
          ...(!shouldUseBaseShift ? { shiftOverride: resolvedShift } : {}),
          overtimeHours,
          ...(isLegalOvertime ? { isLegalOvertime } : {}),
          ...(leaveDuration ? { leaveDuration } : {})
        }
        await saveDayRecord(record)
        setOverrides(current => applyRecordToOverrides(current, record, shiftEditor.baseShift))
      }
      setShiftEditor(null)
      setStatusText('已保存到本机')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存失败，请稍后重试')
      setStatusText('保存失败')
    } finally {
      setIsSavingRecord(false)
    }
  }

  return (
    <main className="app-shell">
      {errorText ? <p className="error-banner">{errorText}</p> : null}

      {!canPersist ? (
        <section className="demo-notice">
          当前浏览器不允许本机存储，改动只保留在内存里，刷新就会丢失。请用状态栏的「导出备份」及时保存数据。
        </section>
      ) : null}

      {isStatsRoute ? (
        <StatsView
          isAdminUser
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
          shouldAnimateEntry
          statsPerson={statsPerson}
          statsViewMode={statsViewMode}
          teamChartMax={teamChartMax}
          teamStats={teamStats}
          onBack={backToSchedule}
          onMonthChange={setSelectedMonth}
          onRefresh={() => void refreshLocalData('统计数据已读取', true)}
          onSalaryInputChange={(field, value) => void setSalaryInputValue(field, value)}
          onStatsPersonChange={setStatsPersonName}
          onStatsViewModeChange={setStatsViewMode}
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
              selectedMonth={selectedMonth}
              startDate={monthView.startDate}
              statusText={statusText}
              onExportBackup={exportBackup}
              onImportBackup={file => void importBackup(file)}
              onMonthChange={setSelectedMonth}
              onRefresh={() => void refreshLocalData('已读取本地数据', isStatsRoute)}
            />
          )}
          isAdmin
          overrides={overrides}
          people={appliedMonthView.people}
          selectedMonth={selectedMonth}
          summary={summary}
          onCurrentUserChange={setSchedulePersonName}
          onMonthChange={setSelectedMonth}
          onOpenShiftEditor={openShiftEditor}
          onStatsOpen={openStatsRoute}
        />
      )}

      {shiftEditor ? (
        <ShiftEditorModal
          editor={shiftEditor}
          isSavingRecord={isSavingRecord}
          onCancel={() => setShiftEditor(null)}
          onLeaveDurationChange={(duration: LeaveDuration) => setShiftEditor(editor => editor ? { ...editor, leaveDuration: duration } : editor)}
          onLegalChange={setShiftEditorLegal}
          onOvertimeInputChange={(value: string) => setShiftEditor(editor => editor ? { ...editor, overtimeInput: value } : editor)}
          onSave={() => void saveShiftEditor()}
          onShiftChange={selectShiftEdit}
        />
      ) : null}
    </main>
  )
}
