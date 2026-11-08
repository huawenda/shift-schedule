import { Toaster as Sonner, type ToasterProps } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from 'lucide-react'

/**
 * Toast 容器（sonner）。
 *
 * 与 CLI 生成版本的差别只有两处，都是主项目的既定前提：
 * 1. 不接 `next-themes` —— 主项目的主题状态在 `platform/theme.ts` 里，
 *    由 App 层通过 `theme` prop 传进来（浅色/深色/跟随系统三态的解析结果）。
 *    为了一个 `theme` 值引入整套主题 Provider 不划算。
 * 2. CSS 变量名用 `--ui-*` —— 主题层给 shadcn 变量统一加了前缀（D16），
 *    原版里的 `var(--popover)` 在主项目是未定义的，会退回 sonner 的默认配色。
 */
const Toaster = ({ theme = 'light', ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--ui-popover)',
          '--normal-text': 'var(--ui-popover-foreground)',
          '--normal-border': 'var(--ui-border)',
          '--border-radius': 'var(--ui-radius)'
        } as React.CSSProperties
      }
      theme={theme}
      toastOptions={{
        classNames: {
          toast: 'cn-toast'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
