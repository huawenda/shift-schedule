import { useRef, type ChangeEvent, type ReactNode } from 'react'

/** 三个一级页面：全员矩阵看全组、月度概览看本人、设置改配置 */
export type Route = 'matrix' | 'overview' | 'settings'

/*
 * 侧栏图标：16px 线性图标，全部内联 SVG。
 * 不引入图标库 —— 应用要能 file:// 双击直接打开、零网络请求，多一个依赖就多一份风险。
 * 统一 stroke=currentColor，颜色跟着文字状态走（默认 faint、悬停 muted、选中 accent）。
 */
const iconProps = {
  'aria-hidden': true,
  className: 'rail-icon',
  fill: 'none',
  viewBox: '0 0 16 16'
} as const

/** 顶栏图标：同尺寸同笔触，但不带 `.rail-icon`（那个类会把颜色压成 faint） */
const glyph = {
  'aria-hidden': true,
  fill: 'none',
  viewBox: '0 0 16 16'
} as const

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

/** 矩阵：一个带内部分栏的表格 */
function IconMatrix() {
  return (
    <svg {...iconProps}>
      <rect {...stroke} x="2.3" y="3.3" width="11.4" height="9.4" rx="1.6" />
      <path {...stroke} d="M2.3 6.5h11.4M6.5 6.5v6.2M10.1 6.5v6.2" />
    </svg>
  )
}

/** 概览：月历 */
function IconCalendar() {
  return (
    <svg {...iconProps}>
      <rect {...stroke} x="2.3" y="3.4" width="11.4" height="10" rx="1.6" />
      <path {...stroke} d="M2.3 6.6h11.4M5.6 2.2v2.4M10.4 2.2v2.4" />
    </svg>
  )
}

/** 设置：两条推子 */
function IconSettings() {
  return (
    <svg {...iconProps}>
      <path {...stroke} d="M2.4 5.6h6M12.5 5.6h1.1M2.4 10.4h1.2M7.6 10.4h6" />
      <circle {...stroke} cx="10.5" cy="5.6" r="1.5" />
      <circle {...stroke} cx="5.5" cy="10.4" r="1.5" />
    </svg>
  )
}

/**
 * 月份步进箭头。
 *
 * 不用 ‹ › 这两个字符：它们的字形、基线、左右留白都跟着字体走，
 * 和 1px 边框的胶囊放一起会显得偏、大小不一，换字体还会变样。
 */
const chevronStroke = { ...stroke, strokeWidth: 1.5 } as const

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="month-icon" {...glyph}>
      <path {...chevronStroke} d={dir === 'left' ? 'M9.9 4.1 6.1 8l3.8 3.9' : 'M6.1 4.1 9.9 8l-3.8 3.9'} />
    </svg>
  )
}

interface ShellProps {
  route: Route
  monthTitle: string
  /** 当前看的结算月就是本月 —— 「回到本期」这时没有可做的事，置灰 */
  atCurrentMonth: boolean
  memberCount: number
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
  atCurrentMonth,
  memberCount,
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
      <a
        className="skip-link"
        href="#main"
        onClick={event => {
          // 不能直接改 hash：那会触发路由监听，把视图切回概览
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        跳到主内容
      </a>
      <nav className="rail" aria-label="主导航">
        <div className="rail-brand">
          <svg className="rail-mark" viewBox="0 0 192 192" aria-hidden="true" focusable="false">
            <rect className="rail-mark-plate" width="192" height="192" rx="44" />
            <circle className="rail-mark-night" cx="96" cy="96" r="58" />
            <path className="rail-mark-day" d="M38 96a58 58 0 0 1 116 0Z" />
            <path
              className="rail-mark-star"
              d="M96 106Q96 124 114 124Q96 124 96 142Q96 124 78 124Q96 124 96 106Z"
            />
          </svg>
          <div className="rail-brand-text">
            <span className="rail-name">昼夜</span>
            <span className="rail-version">个人倒班记录本</span>
            <span className="rail-brand-tick" aria-hidden="true" />
          </div>
        </div>

        <div className="rail-nav">
          <p className="rail-group-label">视图</p>
          <a
            aria-current={route === 'matrix' ? 'page' : undefined}
            className={`rail-item${route === 'matrix' ? ' is-active' : ''}`}
            href="#/matrix"
            onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              onNavigate('matrix')
            }}
          >
            <IconMatrix />
            全员矩阵
          </a>
          <a
            aria-current={route === 'overview' ? 'page' : undefined}
            className={`rail-item${route === 'overview' ? ' is-active' : ''}`}
            href="#/overview"
            onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              onNavigate('overview')
            }}
          >
            <IconCalendar />
            月度概览
          </a>
        </div>

        <div className="rail-foot">
          <a
            aria-current={route === 'settings' ? 'page' : undefined}
            className={`rail-item${route === 'settings' ? ' is-active' : ''}`}
            href="#/settings"
            onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              onNavigate('settings')
            }}
          >
            <IconSettings />
            设置
          </a>
        </div>
      </nav>

      <header className="topbar">
        <div className="month-track">
          <div className="month-switch" role="group" aria-label="切换月份">
            <button aria-label="上一期" className="month-step" type="button" onClick={() => onShiftMonth(-1)}>
              <IconChevron dir="left" />
            </button>
            <span aria-live="polite" className="month-title">{monthTitle}</span>
            <button aria-label="下一期" className="month-step" type="button" onClick={() => onShiftMonth(1)}>
              <IconChevron dir="right" />
            </button>
            {/*
              回到本期并进同一个胶囊：它和左右箭头是同一件事 —— 都在调「当前看的是哪个月」。
              单独拎出去做按钮会像第二个工具，而且它只在切走后才真的能点。
            */}
            <button
              className="month-today"
              disabled={atCurrentMonth}
              type="button"
              onClick={onToday}
            >
              回到本月
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button className="btn" type="button" onClick={onBackup}>导出备份</button>
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>导入备份</button>
          <input
            ref={fileRef}
            accept="application/json,.json"
            className="visually-hidden"
            name="backup-file"
            tabIndex={-1}
            type="file"
            onChange={handleFile}
          />
        </div>
      </header>

      <main className="sheet" id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
