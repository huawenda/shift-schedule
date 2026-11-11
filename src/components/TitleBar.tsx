import { Minus, Square, X } from 'lucide-react'

import { currentWindow } from '@/platform/tauri'
import { BrandLockup, BrandMark } from './Brand'

/**
 * 无边框窗口的自绘标题栏，左右两半分别挂在侧栏与内容区里：
 * - `SidebarTitleBar` 是侧栏的第一行，与侧栏同底色、不画分隔线，侧栏因此是一整层；
 * - `ContentTitleBar` 是 SidebarInset 的第一行，只放窗口按钮。
 *
 * 两半同高。标题栏里只留一个 20px 小标识，放大的品牌字标压到侧栏主体的
 * `.brand-hero` 里（见 styles/titlebar.scss）—— 与参考稿「顶栏小标签 + 下方大字标」一致。
 * 页名不在这里重复：系统窗口标题 / 任务栏仍由 `ROUTE_TITLE` 设置（见 App.tsx）。
 *
 * `data-tauri-drag-region` 单独占一层：内容层 pointer-events: none，
 * 只有按钮重新打开指针事件，这样点空白处能拖窗口、点按钮又不会被当成拖拽。
 */

function toggleMaximize() {
  void currentWindow()?.toggleMaximize?.()
}

function WindowControls() {
  const win = currentWindow()
  return (
    <div className="titlebar-controls">
      <button
        aria-label="最小化"
        className="titlebar-btn"
        type="button"
        onClick={() => void win?.minimize?.()}
      >
        <Minus />
      </button>
      <button aria-label="最大化或还原" className="titlebar-btn" type="button" onClick={toggleMaximize}>
        <Square />
      </button>
      <button
        aria-label="关闭"
        className="titlebar-btn titlebar-btn--close"
        type="button"
        onClick={() => void win?.close?.()}
      >
        <X />
      </button>
    </div>
  )
}

/** 侧栏那半条：只放小标识，品牌大字在它下面的 .brand-hero 里。 */
export function SidebarTitleBar() {
  return (
    <div className="titlebar titlebar--sidebar">
      <div className="titlebar-drag" data-tauri-drag-region onDoubleClick={toggleMaximize} />
      <div className="titlebar-content">
        <BrandMark className="size-5" />
      </div>
    </div>
  )
}

interface ContentTitleBarProps {
  /** 窄屏没有侧栏，品牌要挪到这半条里才看得见 */
  showBrand: boolean
}

/** 内容区那半条：只放窗口按钮，页名交给系统窗口标题。 */
export function ContentTitleBar({ showBrand }: ContentTitleBarProps) {
  return (
    <div className="titlebar titlebar--content">
      <div className="titlebar-drag" data-tauri-drag-region onDoubleClick={toggleMaximize} />
      <div className="titlebar-content">
        {showBrand ? <BrandLockup variant="bar" /> : null}
        <WindowControls />
      </div>
    </div>
  )
}
