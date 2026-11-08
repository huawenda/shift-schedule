import { useMemo } from 'react'
import { toast as sonner } from 'sonner'

export type ToastTone = 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  tone?: ToastTone
  detail?: string
  /** null = 不自动消失，必须手动关闭 */
  duration?: number | null
  closable?: boolean
  /** 可选操作按钮（如「撤销」）；点了之后提示自动关闭 */
  action?: ToastAction
}

export interface ToastUpdate extends ToastOptions {
  text?: string
}

export interface ToastApi {
  info: (text: string, options?: ToastOptions) => number
  warning: (text: string, options?: ToastOptions) => number
  error: (text: string, options?: ToastOptions) => number
  /** 常驻提示：不自动消失，带关闭按钮 */
  sticky: (text: string, options?: ToastOptions) => number
  /** 原地改写一条提示（导入流程从「正在导入」变成结果时用） */
  update: (id: number, options: ToastUpdate) => void
  dismiss: (id: number) => void
  /** 兼容保留：悬停暂停倒计时由 sonner 内建处理，外部不用再管 */
  pause: (id: number) => void
  resume: (id: number) => void
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 2600,
  warning: 5000,
  error: 5000
}

/** sonner 的 id 允许 string | number，这里自己发号，保证 `update(id)` / `dismiss(id)` 语义不变 */
let seq = 0

/**
 * 提示条：对外 API 不变，内部换成 sonner。
 *
 * 以前是一套自研队列（useToasts + ToastHost + toasts.scss 共约 450 行）：自己算倒计时、
 * 自己做进出场动画、自己限制最多 3 条。这些 sonner 全都内建（悬停暂停、堆叠、
 * 自动关闭、aria-live 朗读），所以整层删掉。
 *
 * 保留原 API 的原因：调用点散在 App、useBackupFlow 和各个页面里，换 API 要改十几处业务代码，
 * 而语义本来一一对应：
 *   tone          → toast.info / warning / error
 *   detail        → description
 *   duration:null → duration: Infinity（常驻）
 *   action        → action
 *   update        → 用同一个 id 再调一次（sonner 按 id 合并）
 */
export function useToasts(): ToastApi {
  return useMemo<ToastApi>(() => {
    function emit(tone: ToastTone, text: string, options?: ToastOptions, id?: number): number {
      const toastId = id ?? ++seq
      const duration = options?.duration === null
        ? Infinity
        : options?.duration ?? DEFAULT_DURATION[tone]

      const payload = {
        id: toastId,
        description: options?.detail,
        duration,
        closeButton: options?.closable ?? false,
        action: options?.action
          ? { label: options.action.label, onClick: options.action.onClick }
          : undefined
      }

      if (tone === 'error') sonner.error(text, payload)
      else if (tone === 'warning') sonner.warning(text, payload)
      else sonner.info(text, payload)

      return toastId
    }

    return {
      info: (text, options) => emit('info', text, options),
      warning: (text, options) => emit('warning', text, options),
      error: (text, options) => emit('error', text, options),
      sticky: (text, options) =>
        emit(options?.tone ?? 'info', text, { duration: null, closable: true, ...options }),
      update: (id, options) => {
        if (options.text === undefined) return
        emit(options.tone ?? 'info', options.text, options, id)
      },
      dismiss: id => sonner.dismiss(id),
      // sonner 自己会在悬停 / 聚焦时暂停倒计时，这两个留着只为不改调用方
      pause: () => {},
      resume: () => {}
    }
  }, [])
}
