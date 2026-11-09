import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'

import { STORAGE_KEYS, readRaw, writeRaw } from '../platform/storage'

/**
 * 侧栏展开宽度：拖右缘那条 rail 调整，存本机。
 *
 * shadcn 的 `SidebarProvider` 把 `--sidebar-width` 写成 inline style（16rem），
 * 但它的 `...style` 展开在内置值**之后**，所以外部传入同名的 CSS 变量就能覆盖，
 * 不必改 `components/ui/sidebar.tsx` 那份 CLI 生成的副本。
 * 默认值必须与那里的 `SIDEBAR_WIDTH` 对齐，否则「没拖过」时会突然变宽。
 */
export const SIDEBAR_DEFAULT_WIDTH = 256
export const SIDEBAR_MIN_WIDTH = 200
/**
 * 上限 320：默认 256 再放宽 64 就够放长姓名 / 品牌字标了。
 * 原先 400 在常见窗口（1000–1400px）下会吃掉近三分之一屏宽，
 * 画布被挤到 31 天矩阵必然横滚；拖到底反而是个不好用的状态。
 * readWidth() 也走 clamp()，所以本机存过 384 / 400 的旧值会在读取时自动夹回 320。
 */
export const SIDEBAR_MAX_WIDTH = 320

/** 位移小于这个就算「点击」（折叠），不算拖动 */
const DRAG_THRESHOLD = 4
const KEYBOARD_STEP = 16
/** 拖动时宽度每帧都在变，停手后再写盘，别让 localStorage 跟着 pointermove 抖 */
const PERSIST_DELAY = 150

function clamp(px: number): number {
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, px)))
}

function readWidth(): number {
  const raw = readRaw(STORAGE_KEYS.sidebarWidth)
  const parsed = raw === null ? NaN : Number(raw)
  // 空值 / 手改坏了的值一律回默认，绝不让 NaN 流进 CSS 变量
  return Number.isFinite(parsed) && parsed > 0 ? clamp(parsed) : SIDEBAR_DEFAULT_WIDTH
}

interface DragState {
  pointerId: number
  startX: number
  startWidth: number
  moved: boolean
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(readWidth)
  const drag = useRef<DragState | null>(null)
  /** 拖完抬手照样派发一次 click，这个标记把它从「折叠」里摘出去 */
  const suppressClick = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    // 首次挂载只是把存过的值读回来，不写盘
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const timer = window.setTimeout(
      () => writeRaw(STORAGE_KEYS.sidebarWidth, String(width)),
      PERSIST_DELAY
    )
    return () => window.clearTimeout(timer)
  }, [width])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      // 上一次拖动若没派发 click（指针移出后抬起），别把抑制标记留到这次
      suppressClick.current = false
      // capture 之后手柄会被侧栏宽度变化推着走，指针也不会丢
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.dataset.dragging = 'true'
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
        moved: false
      }
    },
    [width]
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    if (!state) return
    const delta = event.clientX - state.startX
    if (!state.moved && Math.abs(delta) < DRAG_THRESHOLD) return
    state.moved = true
    setWidth(clamp(state.startWidth + delta))
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    if (!state) return
    drag.current = null
    delete event.currentTarget.dataset.dragging
    if (event.currentTarget.hasPointerCapture(state.pointerId)) {
      event.currentTarget.releasePointerCapture(state.pointerId)
    }
    if (state.moved) suppressClick.current = true
  }, [])

  /** 键盘等价操作：←/→ 每档 16px（Shift 加倍），Home/End 到两端 */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? KEYBOARD_STEP * 2 : KEYBOARD_STEP
      let next: number
      switch (event.key) {
        case 'ArrowLeft':
          next = width - step
          break
        case 'ArrowRight':
          next = width + step
          break
        case 'Home':
          next = SIDEBAR_MIN_WIDTH
          break
        case 'End':
          next = SIDEBAR_MAX_WIDTH
          break
        default:
          return
      }
      event.preventDefault()
      setWidth(clamp(next))
    },
    [width]
  )

  /** 返回 true 表示这次 click 是「拖完抬手」，调用方别当成折叠 */
  const consumeDragClick = useCallback(() => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }, [])

  return {
    width,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown
    },
    consumeDragClick
  }
}
