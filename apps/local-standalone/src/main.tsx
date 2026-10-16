import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.scss'

declare global {
  interface Window {
    __SHIFT_BUILD_ID__?: string
    /** Tauri 在页面脚本执行前注入，壳内的可靠标志，见下方 SW 注册条件。 */
    __TAURI_INTERNALS__?: unknown
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

/* 只在「生产构建 + http(s)」下注册 Service Worker。
 *
 * 三个条件都不能少：
 *  - file:// 下浏览器不允许注册（否则直接抛错）；
 *  - **dev 下绝对不能注册**。service-worker.js 对同源 GET 是缓存优先，
 *    会把 Vite 的模块 URL（/src/main.tsx、/src/features/…）全部缓存下来。
 *    结果是改完代码刷新看到的还是旧版本，HMR 也被绕过 ——
 *    这个坑实际踩过一次，排查了很久才定位到是 SW 而不是代码。
 *  - **Tauri 壳里也不能注册**。壳在 Windows 上把页面挂在
 *    http://tauri.localhost 上 —— 它是 http 开头，上面那条挡不住，
 *    但壳里的资源由程序随安装包一起提供、升级时整体替换，本来就不需要
 *    缓存层。留着它反而是缓存优先：换了新版本打开仍命中旧缓存，
 *    界面停在老代码上，且没有任何提示，比没有 SW 更难查。
 *    桌面版构建（desktop/vite.config.ts）会另外把 sw 文件本身摘掉，
 *    这里再挡一道，两处独立生效。
 *
 *    判据用 Tauri 注入的全局变量而不是域名：静态版的审计脚本
 *    （verify-dist / screenshot-dist）也是跑在 127.0.0.1 上的，
 *    按域名排除会连带把静态版的 SW 一起关掉 —— 那是回归。
 *    __TAURI_INTERNALS__ 由 Tauri 在页面脚本执行前注入，是壳内唯一的
 *    可靠标志；tauri.localhost 作为读不到注入变量时的兜底。 */
const isTauriHost = Boolean(window.__TAURI_INTERNALS__) || window.location.hostname === 'tauri.localhost'

if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  window.location.protocol.startsWith('http') &&
  !isTauriHost
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service worker registration failed', error)
    })
  })
}
