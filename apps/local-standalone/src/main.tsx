import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.scss'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// 只有通过 http(s) 打开时才注册 Service Worker：file:// 下浏览器不允许注册。
// 本地版本身已经是全离线资源，注册它只是为了能用「安装到桌面/主屏幕」。
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service worker registration failed', error)
    })
  })
}
