import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.scss'

declare global {
  interface Window {
    __SHIFT_BUILD_ID__?: string
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

/* 只在「生产构建 + http(s)」下注册 Service Worker。
 *
 * 两个条件都不能少：
 *  - file:// 下浏览器不允许注册（否则直接抛错）；
 *  - **dev 下绝对不能注册**。service-worker.js 对同源 GET 是缓存优先，
 *    会把 Vite 的模块 URL（/src/main.tsx、/src/features/…）全部缓存下来。
 *    结果是改完代码刷新看到的还是旧版本，HMR 也被绕过 ——
 *    这个坑实际踩过一次，排查了很久才定位到是 SW 而不是代码。
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service worker registration failed', error)
    })
  })
}
