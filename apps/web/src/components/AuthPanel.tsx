import type { FormEvent } from 'react'
import type { AuthMode } from '../appTypes'

interface AuthPanelProps {
  authMode: AuthMode
  inviteCode: string
  isSubmittingAuth: boolean
  password: string
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
  inviteCode,
  isSubmittingAuth,
  password,
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
      <div className="auth-tabs">
        <button className={authMode === 'login' ? 'active' : ''} type="button" onClick={() => onAuthModeChange('login')}>登录</button>
        <button className={authMode === 'register' ? 'active' : ''} type="button" onClick={() => onAuthModeChange('register')}>注册</button>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>账号</span>
          <input value={username} onChange={event => onUsernameChange(event.target.value)} autoComplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input value={password} onChange={event => onPasswordChange(event.target.value)} type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {authMode === 'register' ? (
          <>
            <label>
              <span>绑定姓名</span>
              <input value={personName} onChange={event => onPersonNameChange(event.target.value)} />
            </label>
            <label>
              <span>邀请码</span>
              <input value={inviteCode} onChange={event => onInviteCodeChange(event.target.value)} />
            </label>
          </>
        ) : null}
        <button className="primary-button" type="submit" disabled={isSubmittingAuth}>
          {isSubmittingAuth ? '处理中' : authMode === 'login' ? '登录账号' : '注册账号'}
        </button>
      </form>
    </section>
  )
}
