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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar text-sidebar-foreground"
    >
      <div className="grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {items.map(item => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <a
              aria-current={active ? 'page' : undefined}
              data-view={item.id}
              className={`flex h-14 flex-col items-center justify-center gap-1 text-xs transition-colors ${
                active
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
              }`}
              href={hrefs[item.id]}
              key={item.id}
              onClick={event => intercept(event, item.id)}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
