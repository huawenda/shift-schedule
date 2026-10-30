import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { isTauriShell } from './platform/env'
import './styles.scss'

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
 *    判据见 data/env.ts 的 isTauriShell()：用 Tauri 注入的全局变量而不是域名，
 *    免得把跑在 127.0.0.1 上的静态版审计脚本一起关掉。 */
if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  window.location.protocol.startsWith('http') &&
  !isTauriShell()
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service worker registration failed', error)
    })
  })
}
