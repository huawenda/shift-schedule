import { useEffect } from 'react'

/**
 * 覆盖式滚动条（自绘）。
 *
 * 原生滚动条在 Windows 上又粗又有箭头，静止时杵在画布右边很碍眼；
 * 但完全隐藏又会让人不知道页面能滚。这里改成 macOS 那种「覆盖式」：
 * 静止时完全看不见，滚动时淡入一条细的滑块，停下约 0.7 秒后淡出。
 *
 * 做法：
 *  - 监听 document 上的 scroll（捕获阶段，scroll 事件不冒泡），
 *    拿到真正在滚的那个元素；
 *  - 每个容器配一条自己的滑块（外层画布与内层矩阵可能同时滚，
 *    抢同一个滑块会闪）；
 *  - 滑块是 fixed 定位的 div，跟随容器的可视矩形算位置；
 *  - 可以拖动滑块来滚动（原生滚动条已隐藏，拖动得自己实现）。
 *
 * 为什么不用原生滚动条做淡入淡出：`::-webkit-scrollbar` 是伪元素，
 * Chromium 不支持给它加 transition；`scrollbar-color` 虽然是标准属性，
 * 但 WebView2 里同样没有过渡效果。所以只能自绘。
 */

/**
 * 会被接管竖向滚动条的容器。
 *
 * ⚠️ 每日明细的 .detail-scroll **不在**这份名单里 —— 它是卡片内部的表格区，
 * 滑块只有几行高，自绘滑块反而碍眼，要求彻底隐藏（原生滚动条已被压成 0 宽，
 * 鼠标滚轮仍可正常滚动）。
 *
 * `.canvas-flow` 是设置页（人员配置）的滚动区：页头固定后由它单独滚，
 * 原生滚动条已被压成 0 宽，这里不接管就完全看不见了。
 */
const SCROLLERS = '.canvas, .canvas-flow, .matrix-scroll, .dialog'

/** 停下多久后淡出 */
const IDLE_HIDE_MS = 700

/** 滑块最小高度，避免内容很少时缩成一条线 */
const MIN_THUMB = 32

/** 滑块与容器边缘的间距 */
const EDGE = 8

/** 滑块宽度 */
const WIDTH = 8

interface Entry {
  el: HTMLElement
  thumb: HTMLDivElement
  timer: number
  dragging: boolean
  dragStartY: number
  dragStartScroll: number
  dragTrack: number
  dragThumb: number
}

export function ScrollOverlay() {
  useEffect(() => {
    const root = document.createElement('div')
    root.className = 'scroll-overlay'
    root.setAttribute('aria-hidden', 'true')
    document.body.appendChild(root)

    /** 每个滚动容器一条滑块 */
    const entries = new Map<HTMLElement, Entry>()

    function ensureEntry(el: HTMLElement): Entry {
      const existing = entries.get(el)
      if (existing) return existing

      const thumb = document.createElement('div')
      thumb.className = 'scroll-overlay-thumb'
      root.appendChild(thumb)

      const entry: Entry = {
        el,
        thumb,
        timer: 0,
        dragging: false,
        dragStartY: 0,
        dragStartScroll: 0,
        dragTrack: 0,
        dragThumb: 0
      }
      entries.set(el, entry)

      thumb.addEventListener('pointerdown', event => {
        if (!entry.dragging) {
          const m = measure(el)
          entry.dragging = true
          entry.dragStartY = event.clientY
          entry.dragStartScroll = el.scrollTop
          entry.dragTrack = m.trackH
          entry.dragThumb = m.thumbH
          thumb.setPointerCapture(event.pointerId)
          thumb.classList.add('is-dragging')
        }
        event.preventDefault()
      })

      thumb.addEventListener('pointermove', event => {
        if (!entry.dragging) return
        const maxScroll = el.scrollHeight - el.clientHeight
        const travel = Math.max(1, entry.dragTrack - entry.dragThumb)
        el.scrollTop = entry.dragStartScroll + ((event.clientY - entry.dragStartY) / travel) * maxScroll
      })

      const endDrag = () => {
        if (!entry.dragging) return
        entry.dragging = false
        thumb.classList.remove('is-dragging')
        scheduleHide(entry)
      }
      thumb.addEventListener('pointerup', endDrag)
      thumb.addEventListener('pointercancel', endDrag)

      return entry
    }

    function measure(el: HTMLElement) {
      const rect = el.getBoundingClientRect()
      const trackTop = rect.top + EDGE
      const trackH = Math.max(1, rect.bottom - EDGE - trackTop)
      const ratio = el.clientHeight / Math.max(1, el.scrollHeight)
      const thumbH = Math.max(MIN_THUMB, Math.min(trackH, trackH * ratio))
      return { rect, trackTop, trackH, thumbH }
    }

    function paint(entry: Entry) {
      const el = entry.el
      const m = measure(el)
      const maxScroll = el.scrollHeight - el.clientHeight
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollTop / maxScroll)) : 0
      entry.thumb.style.left = `${Math.round(m.rect.right - EDGE - WIDTH)}px`
      entry.thumb.style.top = `${Math.round(m.trackTop + progress * (m.trackH - m.thumbH))}px`
      entry.thumb.style.height = `${Math.round(m.thumbH)}px`
    }

    function scheduleHide(entry: Entry) {
      window.clearTimeout(entry.timer)
      entry.timer = window.setTimeout(() => {
        if (!entry.dragging) entry.thumb.classList.remove('is-visible')
      }, IDLE_HIDE_MS)
    }

    function show(el: HTMLElement) {
      // 竖向压根不溢出就没有滑块可言
      if (el.scrollHeight <= el.clientHeight + 1) return
      const entry = ensureEntry(el)
      paint(entry)
      entry.thumb.classList.add('is-visible')
      scheduleHide(entry)
    }

    function onScroll(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!target.matches(SCROLLERS)) return
      show(target)
    }

    // scroll 事件不冒泡，必须用捕获阶段才能在 document 上收到
    document.addEventListener('scroll', onScroll, true)

    return () => {
      document.removeEventListener('scroll', onScroll, true)
      entries.forEach(entry => window.clearTimeout(entry.timer))
      root.remove()
    }
  }, [])

  return null
}
