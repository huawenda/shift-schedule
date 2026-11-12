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
import { BrandLockup } from './Brand'
import { SidebarTitleBar } from './TitleBar'
import type { Route } from './AppShell'

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
  const { state } = useSidebar()

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

  const inTauri = isTauriShell()
  /**
   * JIG DATA 页只在桌面壳里出现。
   *
   * 这一页要读用户自选的 Excel 文件、读系统剪贴板（从邮件正文里挑 Jig ID）、
   * 导出带标红的 Excel —— 这三件事都依赖 Tauri 的文件系统与剪贴板插件。
   * 静态版与小程序端没有这些能力，挂一个点不动的入口只会让人以为坏了。
   */
  const showJig = inTauri
  /** 生产速查只读静态数据，不依赖壳能力 —— web 版也显示 */
  const showLookup = true
  const showBusiness = showJig || showLookup

  return (
    <Sidebar collapsible="icon">
      {/* 壳里的标题栏段与侧栏同一层（不画分隔线），只留 20px 小标识；
          放大的品牌字标压到它下面的 .brand-hero，像参考稿那样沉一层。
          浏览器 / 静态版没有自绘标题栏，品牌仍是常规尺寸。
          两处共用 BrandLockup —— 图案与文案完全一致，只调尺寸与排版。 */}
      {inTauri ? <SidebarTitleBar /> : null}
      <SidebarHeader className={inTauri ? 'brand-hero' : undefined}>
        <a
          className="flex items-center gap-2 rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
          href={hrefs.overview}
          onClick={event => intercept(event, 'overview')}
        >
          <BrandLockup collapseText variant={inTauri ? 'hero' : 'sidebar'} />
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
                      <SidebarMenuButton asChild isActive={route === 'jig'} tooltip="JIG DATA">
                        <a
                          aria-current={route === 'jig' ? 'page' : undefined}
                          data-view="jig"
                          href={hrefs.jig}
                          onClick={event => intercept(event, 'jig')}
                        >
                          <Table2 className="size-4" />
                          <span>JIG DATA</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={route === 'lookup'} tooltip="生产速查">
                      <a
                        aria-current={route === 'lookup' ? 'page' : undefined}
                        data-view="lookup"
                        href={hrefs.lookup}
                        onClick={event => intercept(event, 'lookup')}
                      >
                        <Search className="size-4" />
                        <span>生产速查</span>
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
        右缘这条 rail 只做「点击折叠」：展开 224px / 折叠 48px（见 AppShell），不再绑拖拽事件。
        CLI 版 SidebarRail 自带 onClick={toggleSidebar}，这里只补中文无障碍标签
        与键盘聚焦反馈（默认 tabIndex=-1，键盘另有 Ctrl/Cmd+B 折叠）。
      */}
      <SidebarRail
        aria-label={state === 'collapsed' ? '展开侧栏' : '折叠侧栏'}
        className="focus-visible:after:bg-sidebar-border"
        // CLI 默认给 rail 挂的是「左右拉伸」光标；现在只能点击折叠，别再暗示能拖
        style={{ cursor: 'pointer' }}
        tabIndex={0}
        title={state === 'collapsed' ? '展开侧栏' : '折叠侧栏'}
      />
    </Sidebar>
  )
}
