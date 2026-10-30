import { readRaw, writeRaw, STORAGE_KEYS } from './storage'

/**
 * 关闭主窗口的行为。
 *
 * - `exit`：直接退出（默认，保持加托盘之前的行为）
 * - `tray`：隐藏到托盘，程序继续运行
 *
 * 这是桌面壳专属偏好，浏览器里不会出现这个设置。
 */
export type CloseBehavior = 'exit' | 'tray'

export const DEFAULT_CLOSE_BEHAVIOR: CloseBehavior = 'exit'

export function getCloseBehavior(): CloseBehavior {
  return readRaw(STORAGE_KEYS.closeBehavior) === 'tray' ? 'tray' : DEFAULT_CLOSE_BEHAVIOR
}

export function setCloseBehavior(value: CloseBehavior): void {
  writeRaw(STORAGE_KEYS.closeBehavior, value)
}

/**
 * 把当前设置同步给 Rust 侧。
 *
 * 关闭拦截发生在 Rust 的 `on_window_event` 里，前端只负责把「用户选了什么」
 * 通过自定义命令传过去；浏览器里没有 __TAURI__，直接跳过。
 */
export function syncCloseBehaviorToShell(value: CloseBehavior): void {
  if (typeof window === 'undefined') return
  const invoke = window.__TAURI__?.core?.invoke
  if (!invoke) return
  void invoke('set_close_to_tray', { enabled: value === 'tray' }).catch(() => {})
}
