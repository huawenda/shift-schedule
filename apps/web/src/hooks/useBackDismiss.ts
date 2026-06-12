import { useEffect, useRef } from 'react'

const overlayHistoryKey = '__shiftScheduleOverlay'
let overlaySequence = 0

export function useBackDismiss(isOpen: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss)
  const hasOverlayEntryRef = useRef(false)
  const isHandlingPopRef = useRef(false)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    const overlayId = `${Date.now()}-${overlaySequence += 1}`
    const previousState = window.history.state
    hasOverlayEntryRef.current = true
    window.history.pushState(
      { ...(previousState && typeof previousState === 'object' ? previousState : {}), [overlayHistoryKey]: overlayId },
      '',
      window.location.href
    )

    const handlePopState = () => {
      if (!hasOverlayEntryRef.current) return
      hasOverlayEntryRef.current = false
      isHandlingPopRef.current = true
      onDismissRef.current()
      window.setTimeout(() => {
        isHandlingPopRef.current = false
      }, 0)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (!hasOverlayEntryRef.current || isHandlingPopRef.current) return
      hasOverlayEntryRef.current = false
      window.history.back()
    }
  }, [isOpen])
}
