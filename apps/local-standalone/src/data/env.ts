declare global {
  interface Window {
    __SHIFT_BUILD_ID__?: string
    /** Tauri 在页面脚本执行前注入，壳内的可靠标志。 */
    __TAURI_INTERNALS__?: unknown
  }
}

/**
 * 是否跑在 Tauri 壳里。
 *
 * 判据用 Tauri 注入的全局变量而不是域名：静态版的审计脚本（verify-dist 等）
 * 也是跑在 127.0.0.1 上的，按域名排除会误伤静态版。
 * `tauri.localhost` 作为读不到注入变量时的兜底。
 *
 * 这个区别不只是技术细节 —— 存储位置完全不同：
 * - 壳里：%LOCALAPPDATA%\<bundle id>\EBWebView\ 下的独立 WebView2 配置目录，
 *   跟用户自己的浏览器无关，清浏览器缓存动不到它；
 * - 浏览器 / 静态版：那个浏览器的 localStorage，按站点（协议 + 域名 + 端口）隔离。
 * 所以文案里不能一律说「存在浏览器里」。
 */
export function isTauriShell(): boolean {
  return Boolean(window.__TAURI_INTERNALS__) || window.location.hostname === 'tauri.localhost'
}
