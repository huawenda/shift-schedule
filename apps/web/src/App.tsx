import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  getCurrentScheduleMonth,
  getMonthScheduleView,
  getOverrideKey,
  getPersonShiftSummary,
  scheduleData,
  type ScheduleMonth,
  type ShiftType
} from '@shift-schedule/core'
import { isSupabaseConfigured } from './services/env'
import type { CloudOverrides } from './services/cloudRecords'
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
                const isEdited = Boolean(overrides.shiftOverrides[getOverrideKey(person.name, date)])
                return (
                  <div className="shift-cell" key={`${person.name}-${date}`}>
                    {isEdited ? <span className="edited-dot" /> : null}
                    <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </section>
    </main>
  )
}
