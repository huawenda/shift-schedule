import { CalendarDays, LayoutGrid, Settings } from 'lucide-react'

import type { Route } from './AppShell'

interface MobileNavProps {
  route: Route
  /** 三个入口的 href：由 App 生成，带上当前结算月，修饰键开新标签也能落到同一个月份 */
  hrefs: Record<Route, string>
  onNavigate: (route: Route) => void
}

/**
 * 窄屏（≤639px）的底部标签栏。
 *
 * 改造前的老外壳在窄屏就是「侧栏变底部标签栏」；换成 shadcn `Sidebar` 后，
 * 它在窄屏默认变成抽屉 —— 每次切页面都要先拉抽屉，多一步，而且遮罩会把内容压暗。
 * 这里恢复成底部标签栏：三个一级页面永远可见，单击直达。
 *
 * 桌面 / 平板仍用可折叠侧栏（AppSidebar），两套不同时出现。
 */
export function MobileNav({ route, hrefs, onNavigate }: MobileNavProps) {
  /** 修饰键按下时交还给浏览器，等同于「在新标签打开这个视图」 */
  function intercept(event: React.MouseEvent<HTMLAnchorElement>, next: Route) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(next)
  }

  const items = [
    { id: 'matrix' as const, label: '全员矩阵', icon: LayoutGrid },
    { id: 'overview' as const, label: '月度概览', icon: CalendarDays },
    { id: 'settings' as const, label: '设置', icon: Settings }
  ]

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background text-foreground"
    >
      <div className="grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {items.map(item => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <a
              aria-current={active ? 'page' : undefined}
              data-view={item.id}
              className="flex h-14 items-stretch justify-center px-1.5 py-1"
              href={hrefs[item.id]}
              key={item.id}
              onClick={event => intercept(event, item.id)}
            >
              {/* 选中态是**内缩的圆角块**，不是整格铺满 —— 与 shadcn Tabs 的胶囊一致。
                  外层 <a> 仍是整格可点，视觉块只是缩在中间。 */}
              <span
                className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg text-xs transition-colors ${
                  active
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
