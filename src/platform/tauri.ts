/**
 * Tauri 注入的全局对象 —— 本项目所有平台层共用一份类型声明。
 *
 * 壳开了 `withGlobalTauri`，所以 `@tauri-apps/api` 的能力都挂在
 * `window.__TAURI__` 上，不必装那套前端包（少一份版本对齐的负担）。
 *
 * 类型放在这里而不是各文件各写一份：`declare global` 对同一个属性重复声明
 * 会报「Subsequent property declarations must have the same type」，
 * 而且各写一份必然会漂移 —— 多一个方法只改一处、漏一处就是运行时报错。
 */

export interface TauriDialogApi {
  open?: (options: {
    directory?: boolean
    multiple?: boolean
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<string | string[] | null>
}

export interface TauriCoreApi {
  invoke?: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>
}

export interface TauriPathApi {
  /** 系统的「下载」目录；壳里由 Tauri 的 path API 解析 */
  downloadDir?: () => Promise<string>
}

export interface TauriWindowHandle {
  /** 改原生窗口标题（任务栏显示的就是它） */
  setTitle?: (title: string) => Promise<void>
}

export interface TauriWindowApi {
  getCurrentWindow?: () => TauriWindowHandle
}

export interface TauriGlobal {
  core?: TauriCoreApi
  dialog?: TauriDialogApi
  path?: TauriPathApi
  window?: TauriWindowApi
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal
  }
}

/** 取壳注入的全局对象；node（单测）里没有 window，返回 null */
export function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null
  return window.__TAURI__ ?? null
}
