import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

/**
 * 覆盖式滚动条（双向）。
 *
 * 照搬原项目 JIG Data Finder 的 `OverlayScrollbar`。
 *
 * ## 为什么不用原生滚动条
 *
 * 原生滚动条会占掉 10~15px 的宽度/高度，表格右侧的列或底部行因此被挤；
 * 而在只看不滚的时候，这条灰条又一直露在外面。这里把原生条隐藏，
 * 用一条绝对定位的浮层代替：
 *
 *   - 不占布局尺寸，覆盖在内容边缘；
 *   - 只在滚动时出现，停止约 800ms 后淡出；
 *   - 可拖拽，保证隐藏原生条之后仍能精确控制位置。
 *
 * ## 与本项目 `ScrollOverlay` 的分工
 *
 * `ScrollOverlay` 是全局单例，只管**纵向**，靠 document 捕获 scroll 事件
 * 找到真正在滚的元素。它的滑块是 fixed 定位的，跟着视口走。
 *
 * 本组件是**组件形式**，贴在具体的滚动容器旁，位置按容器 rect 算，
 * 且支持**横向** —— JIG 表格工序多、列多，两个方向都要能滚。
 * `.jig-table-scroll` 不在 `ScrollOverlay` 的接管名单里，两者不冲突。
 *
 * 组件必须放在目标滚动元素所在的**定位容器**里（父元素需 position: relative），
 * 浮层位置按 targetRef 与父容器的 rect 差值计算。
 */

interface JigScrollbarProps {
  /**
   * 需要接管滚动条的目标滚动元素。
   *
   * 类型写成 `RefObject<HTMLElement | null>`：React 19 的
   * `useRef<T>(null)` 返回的就是这个类型，写成 `RefObject<HTMLElement>`
   * 会反过来不兼容。
   */
  targetRef: RefObject<HTMLElement | null>
  /** 接管方向，默认纵向 */
  axis?: 'vertical' | 'horizontal'
}

interface View {
  visible: boolean
  railStyle: CSSProperties
  thumbStyle: CSSProperties
}

const EMPTY_VIEW: View = { visible: false, railStyle: {}, thumbStyle: {} }

/** 静止多久后淡出 */
const IDLE_MS = 800
/** 滑块最短长度，内容再长也要能被抓住 */
const MIN_THUMB = 28
/** 浮层在另一方向上的固定厚度（与 CSS 的 10px 对应） */
const RAIL = 10

export function JigScrollbar({ targetRef, axis = 'vertical' }: JigScrollbarProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(EMPTY_VIEW)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = targetRef.current
    const thumb = thumbRef.current
    if (!el || !thumb) return

    let hideTimer: ReturnType<typeof setTimeout> | null = null
    let shown = false
    let lastScroll = axis === 'vertical' ? el.scrollTop : el.scrollLeft
    let drag: {
      start: number
      scroll: number
      travel: number
      max: number
    } | null = null

    const clearTimer = () => {
      if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    }

    const pointerPos = (e: PointerEvent) =>
      axis === 'vertical' ? e.clientY : e.clientX

    const measure = (visible: boolean) => {
      const host = railRef.current?.parentElement
      if (!host) return

      const targetRect = el.getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()

      const viewportSize =
        axis === 'vertical' ? el.clientHeight : el.clientWidth
      const contentSize =
        axis === 'vertical' ? el.scrollHeight : el.scrollWidth
      const scrollPos = axis === 'vertical' ? el.scrollTop : el.scrollLeft
      const max = contentSize - viewportSize

      // 没有可滚动的余量时直接收起，不留下一条空轨道
      if (max <= 1 || viewportSize <= 0) {
        if (shown) {
          shown = false
          setView(v => ({ ...v, visible: false }))
        }
        return
      }

      const thumbSize = Math.max(
        MIN_THUMB,
        Math.round(viewportSize * (viewportSize / contentSize))
      )
      const travel = Math.max(1, viewportSize - thumbSize)
      const thumbOffset = Math.round((scrollPos / max) * travel)

      let railStyle: CSSProperties
      let thumbStyle: CSSProperties
      if (axis === 'vertical') {
        railStyle = {
          top: targetRect.top - hostRect.top,
          height: viewportSize,
          right: hostRect.right - targetRect.right
        }
        thumbStyle = { top: thumbOffset, height: thumbSize }
      } else {
        railStyle = {
          left: targetRect.left - hostRect.left,
          top:
            targetRect.top -
            hostRect.top +
            viewportSize -
            RAIL,
          width: viewportSize
        }
        thumbStyle = { left: thumbOffset, width: thumbSize }
      }

      shown = visible
      setView({ visible, railStyle, thumbStyle })
    }

    const scheduleHide = () => {
      clearTimer()
      hideTimer = setTimeout(() => {
        hideTimer = null
        measure(false)
      }, IDLE_MS)
    }

    const onScroll = () => {
      const pos = axis === 'vertical' ? el.scrollTop : el.scrollLeft
      /*
       * 只有本方向的滚动位置变化才亮起。
       *
       * 同一个元素会同时挂纵向与横向两个浮层，若不判断方向，用户纵向
       * 滚表格时横向浮层也会跟着闪一下。
       */
      if (pos === lastScroll && !drag) return
      lastScroll = pos
      measure(true)
      // 拖拽过程中不重置计时，否则长时间按住会被中途淡出
      if (!drag) scheduleHide()
    }

    const onResize = () => {
      // 尺寸变化时只刷新几何；静止状态下不要把滚动条唤醒
      if (shown) measure(true)
    }

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return
      e.preventDefault()
      clearTimer()

      const viewportSize =
        axis === 'vertical' ? el.clientHeight : el.clientWidth
      const contentSize =
        axis === 'vertical' ? el.scrollHeight : el.scrollWidth
      const thumbSize = Math.max(
        MIN_THUMB,
        Math.round(viewportSize * (viewportSize / contentSize))
      )

      drag = {
        start: pointerPos(e),
        scroll: axis === 'vertical' ? el.scrollTop : el.scrollLeft,
        travel: Math.max(1, viewportSize - thumbSize),
        max: contentSize - viewportSize
      }
      setDragging(true)
      thumb.setPointerCapture(e.pointerId)
      measure(true)
    }

    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const delta = pointerPos(e) - drag.start
      const next = drag.scroll + (delta / drag.travel) * drag.max
      if (axis === 'vertical') el.scrollTop = next
      else el.scrollLeft = next
    }

    const onUp = () => {
      if (!drag) return
      drag = null
      setDragging(false)
      measure(true)
      scheduleHide()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    thumb.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('resize', onResize)

    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
    ro?.observe(el)

    return () => {
      clearTimer()
      el.removeEventListener('scroll', onScroll)
      thumb.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [targetRef, axis])

  return (
    <div
      ref={railRef}
      className={axis === 'vertical' ? 'jig-osb jig-osb--v' : 'jig-osb jig-osb--h'}
      data-visible={view.visible}
      data-dragging={dragging}
      style={view.railStyle}
      aria-hidden="true"
    >
      <div ref={thumbRef} className="jig-osb-thumb" style={view.thumbStyle} />
    </div>
  )
}
