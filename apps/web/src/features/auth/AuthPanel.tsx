import type { FormEvent } from 'react'
import type { SchedulePerson } from '@shift-schedule/core'
import type { AuthMode } from '../../appTypes'

interface AuthPanelProps {
  authMode: AuthMode
  errorText?: string
  inviteCode: string
  isSubmittingAuth: boolean
  password: string
  people: SchedulePerson[]
  personName: string
  username: string
  onAuthModeChange: (mode: AuthMode) => void
  onInviteCodeChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onPersonNameChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onUsernameChange: (value: string) => void
}

export function AuthPanel({
  authMode,
  errorText,
  inviteCode,
  isSubmittingAuth,
  password,
  people,
  personName,
  username,
  onAuthModeChange,
  onInviteCodeChange,
  onPasswordChange,
  onPersonNameChange,
  onSubmit,
  onUsernameChange
}: AuthPanelProps) {
  return (
    <section className="auth-card">
      <div className="auth-mark">
        <h1>倒班表</h1>
        <span>4F · 值班排班与薪资</span>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="登录或注册">
        <button
          aria-selected={authMode === 'login'}
          role="tab"
          type="button"
          onClick={() => onAuthModeChange('login')}
        >
          登录
        </button>
        <button
          aria-selected={authMode === 'register'}
          role="tab"
          type="button"
          onClick={() => onAuthModeChange('register')}
        >
          注册
        </button>
      </div>

      {errorText ? <p className="error-banner auth-error">{errorText}</p> : null}

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>账号</span>
          <input value={username} onChange={event => onUsernameChange(event.target.value)} autoComplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input
            value={password}
            onChange={event => onPasswordChange(event.target.value)}
            type="password"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {authMode === 'register' ? (
          <>
            <label>
              <span>绑定姓名</span>
              <select value={personName} onChange={event => onPersonNameChange(event.target.value)}>
                {people.map(person => (
                  <option key={person.name} value={person.name}>
                    {person.name} / {person.group}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>邀请码</span>
              <input value={inviteCode} onChange={event => onInviteCodeChange(event.target.value)} />
            </label>
          </>
        ) : null}
        <button className="primary" type="submit" disabled={isSubmittingAuth}>
          {isSubmittingAuth ? '处理中…' : authMode === 'login' ? '登录账号' : '注册账号'}
        </button>
      </form>
    </section>
  )
}
