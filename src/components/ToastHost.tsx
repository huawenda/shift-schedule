import type { ToastItem } from '../hooks/useToasts'

interface ToastHostProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
  onPause: (id: number) => void
  onResume: (id: number) => void
}

/**
 * 底部提示层：固定在窗口底部居中，向上堆叠。
 *
 * 容器本身 `pointer-events: none`，只有提示条自己接收点击，
 * 所以它不会挡住画布上的操作；悬停或键盘聚焦时暂停倒计时。
 *
 * **容器必须常驻**：`aria-live` 区域要在内容插入之前就存在，
 * 否则屏幕阅读器不会播报第一条提示。所以这里不因为 toasts 为空而返回 null，
 * 只是渲染一层空的定位容器。
 */
export function ToastHost({ toasts, onDismiss, onPause, onResume }: ToastHostProps) {
  return (
    <div className="toast-layer" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <div
          aria-live={toast.tone === 'error' ? 'assertive' : undefined}
          className={`toast toast--${toast.tone}${toast.leaving ? ' is-leaving' : ''}`}
          key={toast.id}
          onBlur={() => onResume(toast.id)}
          onFocus={() => onPause(toast.id)}
          onMouseEnter={() => onPause(toast.id)}
          onMouseLeave={() => onResume(toast.id)}
        >
          <div className="toast-body">
            <span className="toast-text">{toast.text}</span>
            {toast.detail ? <span className="toast-detail">{toast.detail}</span> : null}
          </div>
          {toast.action ? (
            <button
              className="toast-action"
              type="button"
              onClick={() => {
                toast.action?.onClick()
                onDismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          {toast.closable ? (
            <button
              aria-label="关闭提示"
              className="toast-close"
              type="button"
              onClick={() => onDismiss(toast.id)}
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 12 12">
                <path d="M2.4 2.4 9.6 9.6M9.6 2.4 2.4 9.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
              </svg>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
