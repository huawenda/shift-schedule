import { CalendarDays, LayoutGrid, Settings } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar'
import type { Route } from './AppShell'

/**
 * 品牌标识：一个圆，上半昼、下半夜，中间一颗星。
 *
 * 与桌面图标同源（design/logo/logo.svg），只缩不放；星是「夜」的识别锚点，缩到再小也留着。
 * 颜色仍走 tokens.scss 的 `--brand-*`：外壳虽然换成了 shadcn 默认的浅色侧栏，
 * 标识本身的四块色仍属品牌资产，不跟着外壳走。
 */
function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="size-9 shrink-0 rounded-[10px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
      focusable="false"
      viewBox="0 0 192 192"
    >
      <rect fill="var(--brand-ink)" height="192" rx="44" width="192" />
      <circle cx="96" cy="96" fill="var(--brand-night)" r="58" />
      <path d="M38 96a58 58 0 0 1 116 0Z" fill="var(--brand-day)" />
      <path
        d="M96 106Q96 124 114 124Q96 124 96 142Q96 124 78 124Q96 124 96 106Z"
        fill="var(--brand-star)"
      />
    </svg>
  )
}

interface AppSidebarProps {
  route: Route
  /** 三个入口的 href：由 App 生成，带上当前结算月，修饰键开新标签也能落到同一个月份 */
  hrefs: Record<Route, string>
  onNavigate: (route: Route) => void
}

/**
 * 侧栏：品牌 + 三个一级页面。
 *
 * 链接仍是真实的 `<a href>`，只是拦住普通点击改成应用内导航 ——
 * Cmd/Ctrl + 点击照旧开新标签，地址里带着当前结算月（和改造前一致）。
 */
export function AppSidebar({ route, hrefs, onNavigate }: AppSidebarProps) {
  /** 修饰键按下时交还给浏览器，等同于「在新标签打开这个视图」 */
  function intercept(event: React.MouseEvent<HTMLAnchorElement>, next: Route) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(next)
  }

  const items = [
    { id: 'matrix' as const, label: '全员矩阵', icon: LayoutGrid },
    { id: 'overview' as const, label: '月度概览', icon: CalendarDays }
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/*
          品牌区不用 `SidebarMenuButton`：它自带 `[&_svg]:size-4`（后代选择器，特异性高于 `.size-9`），
          会把 36px 的标识压成 16px 的小点。这里直接用普通链接 + 同样的 hover 反馈。
          hover 用半透明（/40），与菜单项一致 —— 实色会和「当前选中项」撞脸。
        */}
        <a
          className="flex items-center gap-3 rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
          href={hrefs.overview}
          onClick={event => intercept(event, 'overview')}
        >
          <BrandMark />
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">昼夜</span>
            <span className="truncate text-xs text-muted-foreground">个人倒班记录本</span>
          </div>
        </a>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>视图</SidebarGroupLabel>
          <SidebarGroupContent>
            {/*
              gap-1：shadcn 默认是 gap-0 —— 选中项与相邻的 hover 项都是整块圆角底，
              贴在一起会连成一片（看着像一块更大的选中块）。留 4px 缝，两块才分得开。
            */}
            <SidebarMenu className="gap-1">
              {items.map(item => {
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={route === item.id} tooltip={item.label}>
                      <a
                        aria-current={route === item.id ? 'page' : undefined}
                        data-view={item.id}
                        href={hrefs[item.id]}
                        onClick={event => intercept(event, item.id)}
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={route === 'settings'} tooltip="设置">
              <a
                aria-current={route === 'settings' ? 'page' : undefined}
                data-view="settings"
                href={hrefs.settings}
                onClick={event => intercept(event, 'settings')}
              >
                <Settings className="size-4" />
                <span>设置</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
