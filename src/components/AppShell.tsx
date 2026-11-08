import { type ReactNode } from 'react'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsCompact } from '@/hooks/use-compact'
import { AppSidebar } from './AppSidebar'
import { MobileNav } from './MobileNav'
import { TopBar } from './TopBar'

/** 三个一级页面：全员矩阵看全组、月度概览看本人、设置改配置 */
export type Route = 'matrix' | 'overview' | 'settings'

interface AppShellProps {
  route: Route
  /** 三个入口的 href：由 App 生成，带上当前结算月，修饰键开新标签也能落到同一个月份 */
  hrefs: Record<Route, string>
  monthTitle: string
  /** 当前看的结算月就是本月 —— 「回到本期」这时没有可做的事，置灰 */
  atCurrentMonth: boolean
  onNavigate: (route: Route) => void
  onShiftMonth: (delta: number) => void
  onToday: () => void
  onBackup: () => void
  onRestore: (file: File) => void
  /** 当前生效的主题；顶栏主题按钮的图标与 aria-label 跟着它变 */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  children: ReactNode
}

/**
 * 外壳：shadcn Sidebar + 顶栏 + 平铺内容区。
 *
 * 改造前是深青 L 形外框（228px 侧栏 + 48px 顶栏 + 缩进 8px 的白色画布浮层）。
 * 现在整块换成默认形态：侧栏由 `Sidebar` 提供（折叠、快捷键、cookie 记忆），
 * 画布直接铺在 `SidebarInset` 里，不再有外框、圆角与投影。
 *
 * 窄屏（≤1023px）不挂侧栏：`Sidebar` 在窄屏默认变抽屉，切页面要先拉抽屉、
 * 遮罩还会把内容压暗。这里换成底部标签栏（MobileNav），三个一级页面永远可见 ——
 * 与改造前老外壳在 ≤1023 的做法一致（见 DESIGN.md §6）。
 * 更宽的窗口仍是可折叠侧栏。
 *
 * 高度处理：`h-svh` 而不是 `100vh`。移动浏览器的 `100vh` 是「地址栏收起后的最大高度」，
 * 地址栏展开时比可视区高，页面于是能向下滚几十像素；`svh` 拿到的始终是小视口高度。
 * 下面层层 `min-h-0` 是为了让内容区真的能收缩，`.canvas` 的 `overflow: auto` 才会生效。
 */
export function AppShell({
  route,
  hrefs,
  monthTitle,
  atCurrentMonth,
  onNavigate,
  onShiftMonth,
  onToday,
  onBackup,
  onRestore,
  theme,
  onToggleTheme,
  children
}: AppShellProps) {
  const isCompact = useIsCompact()

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm"
          href="#main"
          onClick={event => {
            // 不能直接改 hash：那会触发路由监听，把视图切回概览
            event.preventDefault()
            document.getElementById('main')?.focus()
          }}
        >
          跳到主内容
        </a>

        {isCompact ? null : (
          <AppSidebar hrefs={hrefs} route={route} onNavigate={onNavigate} />
        )}

        <SidebarInset
          className={`min-h-0 overflow-hidden${isCompact ? ' pb-[calc(56px+env(safe-area-inset-bottom))]' : ''}`}
          id="main"
          tabIndex={-1}
        >
          <TopBar
            atCurrentMonth={atCurrentMonth}
            monthTitle={monthTitle}
            onBackup={onBackup}
            onRestore={onRestore}
            onShiftMonth={onShiftMonth}
            onToday={onToday}
            onToggleTheme={onToggleTheme}
            theme={theme}
          />
          {children}
        </SidebarInset>

        {isCompact ? (
          <MobileNav hrefs={hrefs} route={route} onNavigate={onNavigate} />
        ) : null}
      </SidebarProvider>
    </TooltipProvider>
  )
}
