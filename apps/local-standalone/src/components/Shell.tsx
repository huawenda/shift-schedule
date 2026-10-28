import { useRef, type ChangeEvent, type ReactNode } from 'react'

/** 三个一级页面：全员矩阵看全组、月度概览看本人、设置改配置 */
export type Route = 'matrix' | 'overview' | 'settings'

interface ShellProps {
  route: Route
  monthTitle: string
  memberCount: number
  statusText: string
  warning?: string
  notice?: { text: string; onDismiss: () => void }
  onNavigate: (route: Route) => void
  onShiftMonth: (delta: number) => void
  onToday: () => void
  onBackup: () => void
  onRestore: (file: File) => void
  children: ReactNode
}

/**
 * 外壳：左侧 228px 固定导航 + 48px 顶栏，两者共用一块 tinted 底形成 L 形，
 * 内容区是缩进 8px 的白色画布（无阴影，靠一个色调台阶和 1px 边分层）。
 */
export function Shell({
  route,
  monthTitle,
  memberCount,
  statusText,
  warning,
  notice,
  onNavigate,
  onShiftMonth,
  onToday,
  onBackup,
  onRestore,
  children
}: ShellProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onRestore(file)
    event.target.value = ''
  }

  return (
    <div className="app">
      <nav className="rail" aria-label="主导航">
        <div className="rail-brand">
          <span className="rail-mark" aria-hidden="true" />
          <span className="rail-name">倒班表</span>
          <span className="rail-version">本地版</span>
        </div>

        <div className="rail-nav">
          <button
            aria-current={route === 'matrix' ? 'page' : undefined}
            className={`rail-item${route === 'matrix' ? ' is-active' : ''}`}
            type="button"
            onClick={() => onNavigate('matrix')}
          >
            全员矩阵
          </button>
          <button
            aria-current={route === 'overview' ? 'page' : undefined}
            className={`rail-item${route === 'overview' ? ' is-active' : ''}`}
            type="button"
            onClick={() => onNavigate('overview')}
          >
            月度概览
          </button>
        </div>

        <div className="rail-foot">
          <button
            aria-current={route === 'settings' ? 'page' : undefined}
            className={`rail-item${route === 'settings' ? ' is-active' : ''}`}
            type="button"
            onClick={() => onNavigate('settings')}
          >
            设置
          </button>
          <p className="rail-note">{memberCount} 位成员 · 数据只存在这台电脑</p>
        </div>
      </nav>

      <header className="topbar">
        <div className="month-track">
          <button aria-label="上一期" className="month-step" type="button" onClick={() => onShiftMonth(-1)}>
            ‹
          </button>
          <span className="month-title">{monthTitle}</span>
          <button aria-label="下一期" className="month-step" type="button" onClick={() => onShiftMonth(1)}>
            ›
          </button>
          <button className="btn btn-quiet" type="button" onClick={onToday}>回到本期</button>
        </div>

        <div className="topbar-right">
          {warning ? <span className="topbar-warning" role="status">{warning}</span> : null}
          <span className="topbar-status" role="status">{statusText}</span>
          <button className="btn" type="button" onClick={onBackup}>导出备份</button>
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>导入备份</button>
          <input
            ref={fileRef}
            accept="application/json,.json"
            className="visually-hidden"
            type="file"
            onChange={handleFile}
          />
        </div>
      </header>

      <main className="sheet">
        {notice ? (
          <div className="sheet-notice" role="status">
            <span>{notice.text}</span>
            <button className="banner-close" type="button" onClick={notice.onDismiss}>知道了</button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  )
}
