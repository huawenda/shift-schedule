import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { isTauriShell } from './platform/env'
import './styles.scss'
// Tailwind v4 入口：只启用 theme + utilities（不含 preflight），另在 @layer base 里补了边框两条
import './index.css'

/* 全应用禁用 HTML5 原生拖拽。
 *
 * 链接 / 图片 / 选中的文字在浏览器里默认可拖，拖起来会浮出一张带 URL 的
 * 半透明预览卡片（像把界面「扯走」了一块），在桌面壳里尤其违和。
 * 本项目没有任何 drop 目标，也不做拖放排序，直接取消 dragstart 最省事。
 *
 * 挂在 document 的**捕获阶段**：Radix Dialog / Sheet 用 Portal 挂到 body，
 * 不在 React 根节点内，组件上写 onDragStart 覆盖不到。
 * 侧栏调宽走 pointer events + setPointerCapture，文件导入走 <input type="file">，
 * 都与 HTML5 drag 是两套机制，不受影响。
 * 若以后真要加拖放，改成按 [data-allow-drag] 白名单放行即可。 */
let suppressNextClick = false

/** 每次新手势开始清零：拖出窗口松手时不会派发 click，标记不能留到下一次点击 */
document.addEventListener(
  'pointerdown',
  () => {
    suppressNextClick = false
  },
  true
)

document.addEventListener(
  'dragstart',
  event => {
    event.preventDefault()
    suppressNextClick = true
  },
  true
)

/* dragstart 被取消后，浏览器会把同一次「按下→移动→松手」当成普通 click 派发，
 * 于是拖一下侧栏链接反而会跳到那一页 —— 屏蔽拖拽不能顺带引入误导航。
 * 只吞紧跟被取消的 dragstart 的那一次 click，正常点击（不触发 dragstart）不受影响。 */
document.addEventListener(
  'click',
  event => {
    if (!suppressNextClick) return
    suppressNextClick = false
    event.preventDefault()
    event.stopPropagation()
  },
  true
)

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
