import { useEffect, useRef } from 'react'

const overlayHistoryKey = '__shiftScheduleOverlay'
let overlaySequence = 0
let bodyLockCount = 0
let previousBodyOverflow = ''
let previousBodyTouchAction = ''

function getCurrentOverlayId() {
  const state = window.history.state
  if (!state || typeof state !== 'object') return null
  return typeof state[overlayHistoryKey] === 'string' ? state[overlayHistoryKey] as string : null
}

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    previousBodyTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
  }
  bodyLockCount += 1
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow
    document.body.style.touchAction = previousBodyTouchAction
  }
}

export function useBackDismiss(isOpen: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss)
  const overlayIdRef = useRef<string | null>(null)
  const isHandlingPopRef = useRef(false)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    lockBodyScroll()
    const overlayId = `${Date.now()}-${overlaySequence += 1}`
    const previousState = window.history.state
    let didPushState = false
    const pushTimer = window.setTimeout(() => {
      overlayIdRef.current = overlayId
      // 不传 URL：file:// 下文档 origin 为 null，带 URL 的 pushState 会抛 SecurityError。
      // 省略 URL 等价于压入当前地址，同时兼容本地直接双击打开。
      try {
        window.history.pushState(
          { ...(previousState && typeof previousState === 'object' ? previousState : {}), [overlayHistoryKey]: overlayId },
          ''
        )
        didPushState = true
      } catch {
        didPushState = false
      }
    }, 0)

    const handlePopState = () => {
      if (!overlayIdRef.current) return
      overlayIdRef.current = null
      isHandlingPopRef.current = true
      onDismissRef.current()
      window.setTimeout(() => {
        isHandlingPopRef.current = false
      }, 0)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      unlockBodyScroll()
      window.clearTimeout(pushTimer)
      window.removeEventListener('popstate', handlePopState)

      const overlayIdToClose = overlayIdRef.current
      overlayIdRef.current = null
      if (!didPushState || !overlayIdToClose || isHandlingPopRef.current) return

      // Programmatic close should consume only the synthetic overlay entry.
      // If the page has already navigated, leave the real page stack untouched.
      if (getCurrentOverlayId() === overlayIdToClose) {
        window.history.back()
      }
    }
  }, [isOpen])
}
