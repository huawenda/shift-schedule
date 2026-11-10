import { CalendarDays, LayoutGrid, Search, Settings, Table2 } from 'lucide-react'

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
  SidebarRail,
  useSidebar
} from '@/components/ui/sidebar'
import { isTauriShell } from '@/platform/env'
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

/** 只取 rail 需要的那几个事件，避免这个组件直接依赖宽度 hook */
type RailDragProps = Pick<
  React.ComponentProps<'button'>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onKeyDown'
>

interface AppSidebarProps {
  route: Route
  /** 三个入口的 href：由 App 生成，带上当前结算月，修饰键开新标签也能落到同一个月份 */
  hrefs: Record<Route, string>
  onNavigate: (route: Route) => void
  /** 拖右缘调整宽度；由 AppShell 的 useSidebarWidth 提供 */
  dragProps: RailDragProps
  /** 拖完抬手也会派发 click，用它把那一次从「折叠」里摘出去 */
  consumeDragClick: () => boolean
}

/**
 * 侧栏：品牌 + 三个一级页面。
 *
 * 链接仍是真实的 `<a href>`，只是拦住普通点击改成应用内导航 ——
 * Cmd/Ctrl + 点击照旧开新标签，地址里带着当前结算月（和改造前一致）。
 */
export function AppSidebar({
  route,
  hrefs,
  onNavigate,
  dragProps,
  consumeDragClick
}: AppSidebarProps) {
  const { state, toggleSidebar } = useSidebar()

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

  /**
   * JIG 数据只在桌面壳里出现。
   *
   * 这一页要读用户自选的 Excel 文件、读系统剪贴板（从邮件正文里挑 Jig ID）、
   * 导出带标红的 Excel —— 这三件事都依赖 Tauri 的文件系统与剪贴板插件。
   * 静态版与小程序端没有这些能力，挂一个点不动的入口只会让人以为坏了。
   */
  const showJig = isTauriShell()
  /** 速查只读静态数据，不依赖壳能力 —— web 版也显示 */
  const showLookup = true
  const showBusiness = showJig || showLookup

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
          <SidebarGroupLabel>排班</SidebarGroupLabel>
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

        {showBusiness ? (
          <>
            {/*
              收缩态下两组的分组标题都隐掉了，图标连成一条 —— 补一道短分隔线
              （左右留 8px，不碰侧栏边界），展开态有「业务」标题，不需要。
            */}
            {state === 'collapsed' ? (
              <div
                aria-hidden="true"
                className="mx-2 my-2 h-px shrink-0 bg-sidebar-border"
              />
            ) : null}
            <SidebarGroup>
              <SidebarGroupLabel>业务</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {showJig ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={route === 'jig'} tooltip="JIG 数据">
                        <a
                          aria-current={route === 'jig' ? 'page' : undefined}
                          data-view="jig"
                          href={hrefs.jig}
                          onClick={event => intercept(event, 'jig')}
                        >
                          <Table2 className="size-4" />
                          <span>JIG 数据</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={route === 'lookup'} tooltip="速查">
                      <a
                        aria-current={route === 'lookup' ? 'page' : undefined}
                        data-view="lookup"
                        href={hrefs.lookup}
                        onClick={event => intercept(event, 'lookup')}
                      >
                        <Search className="size-4" />
                        <span>速查</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}
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
      {/*
        右缘这条 rail 原本只是「点击折叠」。这里**复用**它而不是另造一条手柄：
        两者都绝对定位在侧栏右缘，叠在一起会互相抢 pointer 事件。
        SidebarRail 把 {...props} 展开在最后，所以 onClick / title / tabIndex
        也能覆盖，CLI 生成的 sidebar.tsx 一个字都不用改。

        位移 < 4px 时 hook 不算拖动，抬手仍走原来的点击折叠；只有真拖过，
        consumeDragClick 才把那次 click 摘掉，避免「拖完顺手把侧栏收了」。
        折叠态的宽度由 --sidebar-width-icon 决定，拖了也看不出来，索性不绑拖拽。
      */}
      <SidebarRail
        {...(state === 'collapsed' ? {} : dragProps)}
        aria-label={state === 'collapsed' ? '展开侧栏' : '调整侧栏宽度，点击折叠侧栏'}
        className="touch-none select-none data-[dragging=true]:after:bg-sidebar-border focus-visible:after:bg-sidebar-border"
        onClick={() => {
          if (!consumeDragClick()) toggleSidebar()
        }}
        tabIndex={0}
        title="拖动调整宽度 · 点击折叠 · ←/→ 微调"
      />
    </Sidebar>
  )
}
