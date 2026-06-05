import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  canMarkLegalShift,
  getEditableShiftOptionsForBase,
  getCurrentScheduleMonth,
  getMonthScheduleView,
  getOvertimePresetOptions,
  getOverrideKey,
  getPersonShiftSummary,
  normalizeLegalOverride,
  normalizeOvertimeHours,
  scheduleData,
  type LeaveDuration,
  type ScheduleMonth,
  type ShiftType
} from '@shift-schedule/core'
import { isSupabaseConfigured } from './services/env'
import type { CloudDayRecord, CloudOverrides } from './services/cloudRecords'
import type { CurrentUserProfile } from './services/userProfile'

const defaultCurrentUserName = '华文达'
const monthOptions: Array<{ label: string; value: ScheduleMonth }> = [
  { label: '5月', value: '05' },
  { label: '6月', value: '06' },
  { label: '7月', value: '07' },
  { label: '8月', value: '08' },
  { label: '9月', value: '09' },
  { label: '10月', value: '10' },
  { label: '11月', value: '11' },
  { label: '12月', value: '12' }
]
const shiftLabels: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']
const leaveDurationOptions: LeaveDuration[] = ['半天', '一天']
const formatDateForDisplay = (date: string) => date.split('-').join('/')

const emptyOverrides: CloudOverrides = {
  shiftOverrides: {},
  overtimeOverrides: {},
  legalOverrides: {},
  leaveDurationOverrides: {}
}

function getShiftClassName(shift: ShiftType): string {
  return {
    白班: 'shift-day',
    夜班: 'shift-night',
    休息: 'shift-rest',
    白特: 'shift-special-day',
    夜特: 'shift-special-night',
    事假: 'shift-leave'
  }[shift]
}

function getInitialMonth(): ScheduleMonth {
  return getCurrentScheduleMonth(scheduleData) ?? '06'
}

type AuthMode = 'login' | 'register'

interface ShiftEditorState {
  personName: string
  date: string
  baseShift: ShiftType
  selectedShift: ShiftType | 'default'
  overtimeInput: string
  isLegal: boolean
  leaveDuration: LeaveDuration
}

function getBaseShift(personName: string, date: string): ShiftType | null {
  const person = scheduleData.people.find(item => item.name === personName)
  const dateIndex = scheduleData.dates.indexOf(date)
  if (!person || dateIndex < 0) return null

  return person.shifts[dateIndex]
}

function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

function canRecordOvertime(shift: ShiftType): boolean {
  return shift !== '休息' && shift !== '事假'
}

function getEditorEffectiveShift(editor: ShiftEditorState): ShiftType {
  return editor.selectedShift === 'default' ? editor.baseShift : editor.selectedShift
}

function applyRecordToOverrides(overrides: CloudOverrides, record: CloudDayRecord, baseShift: ShiftType): CloudOverrides {
  const key = getOverrideKey(record.personName, record.date)
  const nextOverrides: CloudOverrides = {
    shiftOverrides: { ...overrides.shiftOverrides },
    overtimeOverrides: { ...overrides.overtimeOverrides },
    legalOverrides: { ...overrides.legalOverrides },
    leaveDurationOverrides: { ...overrides.leaveDurationOverrides }
  }

  if (record.shiftOverride && record.shiftOverride !== baseShift) {
    nextOverrides.shiftOverrides[key] = record.shiftOverride
  } else {
    delete nextOverrides.shiftOverrides[key]
  }

  if ((record.overtimeHours ?? 0) > 0) {
    nextOverrides.overtimeOverrides[key] = record.overtimeHours ?? 0
  } else {
    delete nextOverrides.overtimeOverrides[key]
  }

  if (record.isLegalOvertime === true) {
    nextOverrides.legalOverrides[key] = true
  } else {
    delete nextOverrides.legalOverrides[key]
  }

  if (record.shiftOverride === '事假' && record.leaveDuration) {
    nextOverrides.leaveDurationOverrides[key] = record.leaveDuration
  } else {
    delete nextOverrides.leaveDurationOverrides[key]
  }

  return nextOverrides
}

function deleteRecordFromOverrides(overrides: CloudOverrides, personName: string, date: string): CloudOverrides {
  const key = getOverrideKey(personName, date)
  const nextOverrides: CloudOverrides = {
    shiftOverrides: { ...overrides.shiftOverrides },
    overtimeOverrides: { ...overrides.overtimeOverrides },
    legalOverrides: { ...overrides.legalOverrides },
    leaveDurationOverrides: { ...overrides.leaveDurationOverrides }
  }

  delete nextOverrides.shiftOverrides[key]
  delete nextOverrides.overtimeOverrides[key]
  delete nextOverrides.legalOverrides[key]
  delete nextOverrides.leaveDurationOverrides[key]
  return nextOverrides
}

export function App() {
  const [selectedMonth, setSelectedMonth] = useState<ScheduleMonth>(getInitialMonth)
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [overrides, setOverrides] = useState<CloudOverrides>(emptyOverrides)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [personName, setPersonName] = useState(defaultCurrentUserName)
  const [inviteCode, setInviteCode] = useState('')
  const [isBooting, setIsBooting] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false)
  const [isSavingRecord, setIsSavingRecord] = useState(false)
  const [shiftEditor, setShiftEditor] = useState<ShiftEditorState | null>(null)
  const [statusText, setStatusText] = useState('准备同步')
  const [errorText, setErrorText] = useState('')

  const isConfigured = isSupabaseConfigured()
  const monthView = useMemo(() => getMonthScheduleView(scheduleData, selectedMonth), [selectedMonth])
  const currentUserName = profile?.profile?.personName || defaultCurrentUserName
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
  const visibleDates = appliedMonthView.dates.slice(0, 7)

  useEffect(() => {
    void boot()
  }, [])

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
      if (loadedProfile.profile) {
        await refreshCloudData('已同步云端数据')
      } else {
        setStatusText(isConfigured ? '请登录后同步' : '演示模式')
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '初始化失败')
      setStatusText('同步失败')
    } finally {
      setIsBooting(false)
    }
  }

  async function refreshCloudData(successText = '同步完成') {
    setIsSyncing(true)
    setErrorText('')

    try {
      const { loadCloudOverrides } = await import('./services/cloudRecords')
      setOverrides(await loadCloudOverrides())
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
      setStatusText('登录成功')
      await refreshCloudData('已同步云端数据')
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
    setStatusText('已退出登录')
  }

  function openShiftEditor(personName: string, date: string) {
    if (isConfigured && !profile?.profile) {
      setErrorText('请先登录后再编辑排班')
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

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Web 主线</p>
          <h1>倒班表</h1>
          <p className="period">{formatDateForDisplay(monthView.startDate)} - {formatDateForDisplay(monthView.endDate)}</p>
        </div>
        <button className="sync-button" type="button" disabled={isSyncing || isBooting} onClick={() => refreshCloudData()}>
          {isSyncing ? '同步中' : '同步'}
        </button>
      </section>

      <nav className="month-tabs" aria-label="选择月份">
        {monthOptions.map(month => (
          <button
            className={`month-tab ${selectedMonth === month.value ? 'active' : ''}`}
            key={month.value}
            type="button"
            onClick={() => setSelectedMonth(month.value)}
          >
            {month.label}
          </button>
        ))}
      </nav>

      <section className="status-strip">
        <span>{statusText}</span>
        {profile?.profile ? (
          <button type="button" onClick={logout}>退出</button>
        ) : null}
      </section>

      {errorText ? <p className="error-banner">{errorText}</p> : null}

      {!profile?.profile && isConfigured ? (
        <section className="auth-card">
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} type="button" onClick={() => setAuthMode('login')}>登录</button>
            <button className={authMode === 'register' ? 'active' : ''} type="button" onClick={() => setAuthMode('register')}>注册</button>
          </div>
          <form className="auth-form" onSubmit={submitAuth}>
            <label>
              <span>账号</span>
              <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" />
            </label>
            <label>
              <span>密码</span>
              <input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
            </label>
            {authMode === 'register' ? (
              <>
                <label>
                  <span>绑定姓名</span>
                  <input value={personName} onChange={event => setPersonName(event.target.value)} />
                </label>
                <label>
                  <span>邀请码</span>
                  <input value={inviteCode} onChange={event => setInviteCode(event.target.value)} />
                </label>
              </>
            ) : null}
            <button className="primary-button" type="submit" disabled={isSubmittingAuth}>
              {isSubmittingAuth ? '处理中' : authMode === 'login' ? '登录账号' : '注册账号'}
            </button>
          </form>
        </section>
      ) : null}

      {!isConfigured ? (
        <section className="demo-notice">
          当前未配置 Supabase，Web 端以演示数据运行。复制 <code>apps/web/.env.example</code> 为 <code>apps/web/.env.local</code> 后可连接云端。
        </section>
      ) : null}

      <section className="current-user-card">
        <div className="section-header">
          <div>
            <span className="muted-label">当前用户</span>
            <h2>{appliedCurrentUser.name} / {appliedCurrentUser.group}</h2>
          </div>
          {profile?.isAdmin ? <span className="admin-badge">管理员</span> : null}
        </div>

        <div className="summary-grid">
          {shiftLabels.map(shift => (
            <div className={`summary-item ${getShiftClassName(shift)}`} key={shift}>
              <strong>{summary[shift] ?? 0}</strong>
              <span>{shift}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="schedule-card">
        <div className="section-header">
          <h2>近期排班</h2>
          <span className="muted-label">Web / Supabase</span>
        </div>

        <div className="schedule-grid" style={{ gridTemplateColumns: `120px repeat(${visibleDates.length}, minmax(72px, 1fr))` }}>
          <div className="table-head sticky-name">姓名</div>
          {visibleDates.map(date => <div className="table-head" key={date}>{date.slice(3)}</div>)}

          {appliedMonthView.people.slice(0, 8).map(person => (
            <Fragment key={person.name}>
              <div className="person-cell sticky-name">
                <strong>{person.name}</strong>
                <span>{person.group}</span>
              </div>
              {visibleDates.map((date, index) => {
                const shift = person.shifts[index]
                const key = getOverrideKey(person.name, date)
                const isEdited = Boolean(
                  overrides.shiftOverrides[key] ||
                  overrides.overtimeOverrides[key] ||
                  overrides.legalOverrides[key] ||
                  overrides.leaveDurationOverrides[key]
                )
                return (
                  <button className="shift-cell" key={`${person.name}-${date}`} type="button" onClick={() => openShiftEditor(person.name, date)}>
                    {isEdited ? <span className="edited-dot" /> : null}
                    <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </section>

      {shiftEditor ? (
        <div className="editor-backdrop" role="presentation" onClick={() => setShiftEditor(null)}>
          <section className="shift-editor" role="dialog" aria-modal="true" aria-labelledby="shift-editor-title" onClick={event => event.stopPropagation()}>
            <div className="section-header">
              <div>
                <span className="muted-label">{shiftEditor.personName} / {shiftEditor.date}</span>
                <h2 id="shift-editor-title">编辑排班</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setShiftEditor(null)}>关闭</button>
            </div>

            <div className="editor-group">
              <span className="editor-label">默认班次</span>
              <button className={`editor-option ${shiftEditor.selectedShift === 'default' ? 'active' : ''}`} type="button" onClick={() => selectShiftEdit('default')}>
                <span className={`shift-chip ${getShiftClassName(shiftEditor.baseShift)}`}>{shiftEditor.baseShift}</span>
              </button>
            </div>

            <div className="editor-group">
              <span className="editor-label">修改为</span>
              <div className="editor-options">
                {getEditableShiftOptionsForBase(shiftEditor.baseShift).map(shift => {
                  const effectiveShift = getEditorEffectiveShift(shiftEditor)
                  const isDisabled = shiftEditor.isLegal && shift === '事假'
                  return (
                    <button
                      className={`editor-option ${effectiveShift === shift ? 'active' : ''}`}
                      disabled={isDisabled}
                      key={shift}
                      type="button"
                      onClick={() => selectShiftEdit(shift === shiftEditor.baseShift ? 'default' : shift)}
                    >
                      <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {getEditorEffectiveShift(shiftEditor) === '事假' ? (
              <div className="editor-group">
                <span className="editor-label">事假时长</span>
                <div className="segmented-row">
                  {leaveDurationOptions.map(duration => (
                    <button
                      className={shiftEditor.leaveDuration === duration ? 'active' : ''}
                      key={duration}
                      type="button"
                      onClick={() => setShiftEditor(editor => editor ? { ...editor, leaveDuration: duration } : editor)}
                    >
                      {duration}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="editor-group">
              <span className="editor-label">法定</span>
              {canMarkLegalShift(getEditorEffectiveShift(shiftEditor)) ? (
                <div className="segmented-row">
                  <button className={!shiftEditor.isLegal ? 'active' : ''} type="button" onClick={() => setShiftEditorLegal(false)}>否</button>
                  <button className={shiftEditor.isLegal ? 'active' : ''} type="button" onClick={() => setShiftEditorLegal(true)}>是</button>
                </div>
              ) : (
                <span className="editor-muted">该班次不可标记法定</span>
              )}
            </div>

            <div className="editor-group">
              <span className="editor-label">加班时长</span>
              {canRecordOvertime(getEditorEffectiveShift(shiftEditor)) ? (
                <>
                  <div className="segmented-row">
                    {getOvertimePresetOptions(getEditorEffectiveShift(shiftEditor), shiftEditor.isLegal).map(hours => (
                      <button
                        className={normalizeOvertimeHours(shiftEditor.overtimeInput) === hours ? 'active' : ''}
                        key={hours}
                        type="button"
                        onClick={() => setShiftEditor(editor => editor ? { ...editor, overtimeInput: formatOvertimeHours(hours) } : editor)}
                      >
                        {formatOvertimeHours(hours)}h
                      </button>
                    ))}
                  </div>
                  <label className="overtime-input-row">
                    <input
                      inputMode="decimal"
                      value={shiftEditor.overtimeInput}
                      onChange={event => setShiftEditor(editor => editor ? { ...editor, overtimeInput: event.target.value } : editor)}
                      placeholder="0"
                    />
                    <span>小时</span>
                  </label>
                </>
              ) : (
                <span className="editor-muted">该班次不记录加班</span>
              )}
            </div>

            <div className="editor-actions">
              <button className="primary-button" type="button" disabled={isSavingRecord} onClick={saveShiftEditor}>
                {isSavingRecord ? '保存中' : '保存'}
              </button>
              <button className="ghost-button" type="button" onClick={() => setShiftEditor(null)}>取消</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
