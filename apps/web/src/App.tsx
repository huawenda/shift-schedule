import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
} from '@shift-schedule/core'
import { AppChrome } from './components/AppChrome'
import { AuthPanel } from './components/AuthPanel'
import { ScheduleView } from './components/ScheduleView'
import { ShiftEditorModal } from './components/ShiftEditorModal'
import { StatsView } from './components/StatsView'
import { defaultCurrentUserName } from './appConstants'
import type { AuthMode, SalaryInputField, SalarySaveStatus, ShiftEditorState, StatsViewMode } from './appTypes'
import {
  applyRecordToOverrides,
  canRecordOvertime,
  deleteRecordFromOverrides,
  getBaseShift,
  getEditorEffectiveShift,
  getOvertimeHoursByType,
  formatOvertimeHours
} from './scheduleHelpers'
import { isSupabaseConfigured } from './services/env'
import type { CloudDayRecord, CloudOverrides } from './services/cloudRecords'
import type { SalaryInputRecords } from './services/salaryInputs'
import type { CurrentUserProfile } from './services/userProfile'

const emptyOverrides: CloudOverrides = {
  shiftOverrides: {},
  overtimeOverrides: {},
  legalOverrides: {},
  leaveDurationOverrides: {}
}

function getInitialMonth(): ScheduleMonth {
  return getCurrentScheduleMonth(scheduleData) ?? '06'
}

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState<ScheduleMonth>(getInitialMonth)
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [overrides, setOverrides] = useState<CloudOverrides>(emptyOverrides)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [personName, setPersonName] = useState(defaultCurrentUserName)
  const [inviteCode, setInviteCode] = useState('')
  const [schedulePersonName, setSchedulePersonName] = useState(defaultCurrentUserName)
  const [statsViewMode, setStatsViewMode] = useState<StatsViewMode>('personal')
  const [statsPersonName, setStatsPersonName] = useState(defaultCurrentUserName)
  const [salaryInputRecords, setSalaryInputRecords] = useState<SalaryInputRecords>({})
  const [isBooting, setIsBooting] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false)
  const [isSavingRecord, setIsSavingRecord] = useState(false)
  const [salarySaveStatus, setSalarySaveStatus] = useState<SalarySaveStatus>('idle')
  const [shiftEditor, setShiftEditor] = useState<ShiftEditorState | null>(null)
  const [statusText, setStatusText] = useState('准备同步')
  const [errorText, setErrorText] = useState('')

  const isConfigured = isSupabaseConfigured()
  const isStatsRoute = location.pathname.startsWith('/stats')
  const isLoginRoute = location.pathname.startsWith('/login')
  const isAdminUser = profile?.isAdmin === true
  const monthView = useMemo(() => getMonthScheduleView(scheduleData, selectedMonth), [selectedMonth])
  const currentUserName = isAdminUser
    ? schedulePersonName
    : profile?.profile?.personName || defaultCurrentUserName
  const currentUser = monthView.people.find(person => person.name === currentUserName) ?? monthView.people[0]
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
  const statsPerson = isAdminUser
    ? scheduleData.people.find(person => person.name === statsPersonName) ?? appliedCurrentUser
    : appliedCurrentUser
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
  const salaryInputKey = `${statsPerson.name}::${selectedMonth}`
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

  useEffect(() => {
    if (!isAdminUser && statsViewMode === 'team') {
      setStatsViewMode('personal')
    }
  }, [isAdminUser, statsViewMode])

  async function boot() {
    setIsBooting(true)
    setErrorText('')

    try {
      if (!isConfigured) {
        setProfile({ openid: null, isAdmin: false, profile: null })
        setStatusText('演示模式')
        return
      }

      const { loadCurrentUserProfile } = await import('./services/userProfile')
      const loadedProfile = await loadCurrentUserProfile()
      setProfile(loadedProfile)
      setSchedulePersonName(loadedProfile.profile?.personName || defaultCurrentUserName)
      setStatsPersonName(loadedProfile.profile?.personName || defaultCurrentUserName)
      if (loadedProfile.profile) {
        await refreshCloudData('已同步云端数据', true)
      } else {
        setStatusText('请登录后同步')
        navigate('/login', { replace: true })
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '初始化失败')
      setStatusText('同步失败')
    } finally {
      setIsBooting(false)
    }
  }

  async function refreshCloudData(successText = '同步完成', includeSalary = isStatsRoute) {
    setIsSyncing(true)
    setErrorText('')

    try {
      const { loadCloudOverrides } = await import('./services/cloudRecords')
      const [nextOverrides, nextSalaryInputs] = await Promise.all([
        loadCloudOverrides(),
        includeSalary
          ? import('./services/salaryInputs').then(module => module.loadSalaryInputs())
          : Promise.resolve<SalaryInputRecords | null>(null)
      ])
      setOverrides(nextOverrides)
      if (nextSalaryInputs) setSalaryInputRecords(nextSalaryInputs)
      setStatusText(successText)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '同步失败，请稍后重试')
      setStatusText('同步失败')
    } finally {
      setIsSyncing(false)
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmittingAuth(true)
    setErrorText('')

    try {
      const { loginWebAccount, registerWebAccount } = await import('./services/userProfile')
      const nextProfile = authMode === 'login'
        ? await loginWebAccount({ username, password })
        : await registerWebAccount({ username, password, personName, inviteCode })
      setProfile(nextProfile)
      setSchedulePersonName(nextProfile.profile?.personName || defaultCurrentUserName)
      setStatsPersonName(nextProfile.profile?.personName || defaultCurrentUserName)
      setStatusText('登录成功')
      await refreshCloudData('已同步云端数据', true)
      navigate('/schedule', { replace: true })
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '登录失败')
      setStatusText('登录失败')
    } finally {
      setIsSubmittingAuth(false)
    }
  }

  async function logout() {
    const { logoutWebAccount } = await import('./services/userProfile')
    await logoutWebAccount()
    setProfile({ openid: null, isAdmin: false, profile: null })
    setOverrides(emptyOverrides)
    setSalaryInputRecords({})
    setSchedulePersonName(defaultCurrentUserName)
    setStatusText('已退出登录')
    if (isConfigured) navigate('/login')
  }

  async function openStatsRoute() {
    if (!profile?.profile && isConfigured) return
    await refreshCloudData('统计数据已同步', true)
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
      const { saveSalaryInput } = await import('./services/salaryInputs')
      await saveSalaryInput(salaryInputKey, nextValues)
      setSalarySaveStatus('saved')
      setStatusText(isConfigured ? '薪资已保存到云端' : '薪资已保存到本地')
    } catch (error) {
      setSalarySaveStatus('error')
      setErrorText(error instanceof Error ? error.message : '薪资保存失败')
      setStatusText('薪资保存失败')
    }
  }

  function openShiftEditor(personName: string, date: string) {
    if (isConfigured && !profile?.profile) {
      setErrorText('请先登录后再编辑排班')
      navigate('/login')
      return
    }

    const boundPersonName = profile?.profile?.personName
    if (profile && !profile.isAdmin && boundPersonName && personName !== boundPersonName) {
      setErrorText('普通用户只能修改本人记录')
      return
    }

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
      const { deleteCloudDayRecord, saveCloudDayRecord } = await import('./services/cloudRecords')
      if (shouldDeleteRecord) {
        await deleteCloudDayRecord(shiftEditor.personName, shiftEditor.date)
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
        await saveCloudDayRecord(record)
        setOverrides(current => applyRecordToOverrides(current, record, shiftEditor.baseShift))
      }
      setShiftEditor(null)
      setStatusText(isConfigured ? '已保存到云端' : '已保存到本地视图')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存失败，请稍后重试')
      setStatusText('保存失败')
    } finally {
      setIsSavingRecord(false)
    }
  }

  const requiresLogin = isConfigured && !profile?.profile && !isBooting

  return (
    <main className={`app-shell ${isLoginRoute ? 'auth-shell' : ''}`}>
      {!isStatsRoute && !isLoginRoute ? (
        <AppChrome
          endDate={monthView.endDate}
          isBooting={isBooting}
          isSyncing={isSyncing}
          profile={profile}
          selectedMonth={selectedMonth}
          startDate={monthView.startDate}
          statusText={statusText}
          onLogout={() => void logout()}
          onMonthChange={setSelectedMonth}
          onRefresh={() => void refreshCloudData('同步完成', isStatsRoute)}
        />
      ) : null}

      {errorText && !isLoginRoute ? <p className="error-banner">{errorText}</p> : null}

      {!isConfigured && !isLoginRoute ? (
        <section className="demo-notice">
          当前未配置 Supabase，Web 端以演示数据运行。复制 <code>apps/web/.env.example</code> 为 <code>apps/web/.env.local</code> 后可连接云端。
        </section>
      ) : null}

      <Routes>
        <Route path="/" element={<Navigate to="/schedule" replace />} />
        <Route
          path="/login"
          element={profile?.profile ? <Navigate to="/schedule" replace /> : (
            <section className="auth-page" aria-label="账号登录">
              <AuthPanel
                authMode={authMode}
                errorText={errorText}
                inviteCode={inviteCode}
                isSubmittingAuth={isSubmittingAuth}
                password={password}
                people={scheduleData.people}
                personName={personName}
                username={username}
                onAuthModeChange={setAuthMode}
                onInviteCodeChange={setInviteCode}
                onPasswordChange={setPassword}
                onPersonNameChange={setPersonName}
                onSubmit={submitAuth}
                onUsernameChange={setUsername}
              />
            </section>
          )}
        />
        <Route
          path="/schedule"
          element={requiresLogin ? <Navigate to="/login" replace /> : (
            <ScheduleView
              appliedCurrentUser={appliedCurrentUser}
              appliedMonthView={appliedMonthView}
              overrides={overrides}
              people={appliedMonthView.people}
              profile={profile}
              selectedMonth={selectedMonth}
              summary={summary}
              onCurrentUserChange={setSchedulePersonName}
              onOpenShiftEditor={openShiftEditor}
              onStatsOpen={() => {
                void openStatsRoute()
                navigate('/stats')
              }}
            />
          )}
        />
        <Route
          path="/stats"
          element={requiresLogin ? <Navigate to="/login" replace /> : (
            <StatsView
              isAdminUser={isAdminUser}
              isSyncing={isSyncing}
              monthEndDate={monthView.endDate}
              monthStartDate={monthView.startDate}
              overtimeChartItems={overtimeChartItems}
              overtimeChartMax={overtimeChartMax}
              personalStats={personalStats}
              salaryCalculation={salaryCalculation}
              salaryInputs={salaryInputs}
              salarySaveStatus={salarySaveStatus}
              selectedMonth={selectedMonth}
              statsPerson={statsPerson}
              statsViewMode={statsViewMode}
              teamChartMax={teamChartMax}
              teamStats={teamStats}
              onBack={() => navigate('/schedule')}
              onMonthChange={setSelectedMonth}
              onRefresh={() => void refreshCloudData('统计数据已同步', true)}
              onSalaryInputChange={(field, value) => void setSalaryInputValue(field, value)}
              onStatsPersonChange={setStatsPersonName}
              onStatsViewModeChange={setStatsViewMode}
            />
          )}
        />
        <Route path="*" element={<Navigate to="/schedule" replace />} />
      </Routes>

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
