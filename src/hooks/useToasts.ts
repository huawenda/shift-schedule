import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  text: string
  detail?: string
  tone: ToastTone
  /** null = 不自动消失，必须手动关闭 */
  duration: number | null
  closable: boolean
  leaving: boolean
  /** 可选操作按钮（如「撤销」）；点了之后提示自动关闭 */
  action?: ToastAction
}

export interface ToastOptions {
  tone?: ToastTone
  detail?: string
  duration?: number | null
  closable?: boolean
  action?: ToastAction
}

export interface ToastUpdate extends ToastOptions {
  text?: string
}

export interface ToastApi {
  toasts: ToastItem[]
  info: (text: string, options?: ToastOptions) => number
  warning: (text: string, options?: ToastOptions) => number
  error: (text: string, options?: ToastOptions) => number
  /** 常驻提示：不自动消失，带关闭按钮 */
  sticky: (text: string, options?: ToastOptions) => number
  /** 原地改写一条提示（导入流程从「正在导入」变成结果时用） */
  update: (id: number, options: ToastUpdate) => void
  dismiss: (id: number) => void
  /** 鼠标悬停 / 键盘聚焦时暂停倒计时 */
  pause: (id: number) => void
  resume: (id: number) => void
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 2600,
  warning: 5000,
  error: 5000
}

/** 屏幕上最多同时存在的条数；超出时顶掉最旧的非常驻提示 */
const MAX_VISIBLE = 3
/** 与 toasts.scss 的退出动画时长保持一致 */
const EXIT_MS = 150

interface TimerState {
  timeout: ReturnType<typeof setTimeout> | null
  deadline: number
  remaining: number
}

/**
 * 底部提示队列。
 *
 * 规则：
 * - 同文案再次出现时原地刷新（连点保存不会堆成一排），并重置倒计时；
 * - 不同文案最多并存 3 条，超出时优先顶掉最旧的非常驻提示；
 * - 悬停 / 聚焦暂停倒计时，离开后按剩余时间继续。
 */
export function useToasts(): ToastApi {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastsRef = useRef<ToastItem[]>([])
  const timers = useRef(new Map<number, TimerState>())
  const nextId = useRef(0)

  useEffect(() => {
    toastsRef.current = toasts
  }, [toasts])

  useEffect(() => () => {
    timers.current.forEach(timer => {
      if (timer.timeout) clearTimeout(timer.timeout)
    })
    timers.current.clear()
  }, [])

  const stopTimer = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (!timer) return
    if (timer.timeout) {
      clearTimeout(timer.timeout)
      timer.timeout = null
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer?.timeout) clearTimeout(timer.timeout)
    timers.current.delete(id)
    setToasts(current => current.map(item => (item.id === id ? { ...item, leaving: true } : item)))
    setTimeout(() => {
      setToasts(current => current.filter(item => item.id !== id))
    }, EXIT_MS)
  }, [])

  const schedule = useCallback((id: number, duration: number) => {
    const previous = timers.current.get(id)
    if (previous?.timeout) clearTimeout(previous.timeout)
    const timeout = setTimeout(() => dismiss(id), duration)
    timers.current.set(id, { timeout, deadline: Date.now() + duration, remaining: duration })
  }, [dismiss])

  const removeNow = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer?.timeout) clearTimeout(timer.timeout)
    timers.current.delete(id)
    setToasts(current => current.filter(item => item.id !== id))
  }, [])

  const push = useCallback((text: string, options: ToastOptions = {}) => {
    const tone = options.tone ?? 'info'
    const duration = options.duration === undefined ? DEFAULT_DURATION[tone] : options.duration
    const closable = options.closable ?? duration === null

    const current = toastsRef.current
    const existing = current.find(item => item.text === text && !item.leaving)
    if (existing) {
      setToasts(list => list.map(item => (
        item.id === existing.id ? { ...item, detail: options.detail, tone, duration, closable, action: options.action } : item
      )))
      if (duration === null) stopTimer(existing.id)
      else schedule(existing.id, duration)
      return existing.id
    }

    const active = current.filter(item => !item.leaving)
    if (active.length >= MAX_VISIBLE) {
      const victim = active.find(item => item.duration !== null) ?? active[0]
      removeNow(victim.id)
    }

    const id = ++nextId.current
    setToasts(list => [...list, {
      id,
      text,
      detail: options.detail,
      tone,
      duration,
      closable,
      leaving: false,
      action: options.action
    }])
    if (duration !== null) schedule(id, duration)
    return id
  }, [removeNow, schedule, stopTimer])

  const update = useCallback((id: number, options: ToastUpdate) => {
    const current = toastsRef.current.find(item => item.id === id)
    if (!current) return

    const duration = options.duration === undefined ? current.duration : options.duration
    const closable = options.closable ?? (duration === null ? true : current.closable)

    setToasts(list => list.map(item => (item.id === id ? {
      ...item,
      text: options.text ?? item.text,
      detail: options.detail ?? item.detail,
      tone: options.tone ?? item.tone,
      duration,
      closable,
      action: options.action ?? item.action
    } : item)))

    if (duration === null) stopTimer(id)
    else schedule(id, duration)
  }, [schedule, stopTimer])

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (!timer || !timer.timeout) return
    clearTimeout(timer.timeout)
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.deadline))
    timer.timeout = null
  }, [])

  const resume = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (!timer || timer.timeout) return
    if (timer.remaining <= 0) {
      dismiss(id)
      return
    }
    const timeout = setTimeout(() => dismiss(id), timer.remaining)
    timers.current.set(id, { timeout, deadline: Date.now() + timer.remaining, remaining: timer.remaining })
  }, [dismiss])

  const info = useCallback((text: string, options?: ToastOptions) => push(text, { ...options, tone: 'info' }), [push])
  const warning = useCallback((text: string, options?: ToastOptions) => push(text, { ...options, tone: 'warning' }), [push])
  const error = useCallback((text: string, options?: ToastOptions) => push(text, { ...options, tone: 'error' }), [push])
  const sticky = useCallback((text: string, options?: ToastOptions) => push(text, {
    ...options,
    duration: null,
    closable: true
  }), [push])

  return { toasts, info, warning, error, sticky, update, dismiss, pause, resume }
}
