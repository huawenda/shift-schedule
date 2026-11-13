import { useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ChevronsUpDown,
  LayoutGrid,
  LogOut,
  Search,
  Settings,
  SlidersHorizontal,
  Table2,
  Users
} from 'lucide-react'

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isTauriShell } from '@/platform/env'
import { quitApp } from '@/platform/appQuit'
import { BrandLockup } from './Brand'
import { SidebarTitleBar } from './TitleBar'
import type { Route } from './AppShell'
import type { SettingsTab } from '@/screens/SettingsScreen'

interface AppSidebarProps {
  route: Route
  /** 侧栏底部显示的名字（本人姓名；没有就落到「未设置本人」） */
  userName: string
  /** 三个入口的 href：由 App 生成，带上当前结算月，修饰键开新标签也能落到同一个月份 */
  hrefs: Record<Route, string>
  onNavigate: (route: Route) => void
  /** 设置页当前分页 —— 进入设置后侧栏会切换成设置导航 */
  settingsTab: SettingsTab
  onSettingsTabChange: (tab: SettingsTab) => void
  /** 设置导航顶部的「返回」：离开设置回到概览 */
  onSettingsBack: () => void
}

/**
 * 侧栏：品牌 + 三个一级页面。
 *
 * **进入设置后，整条侧栏换成设置导航**（分页 + 返回），而不是在画布里再叠一条
 * 二级栏 —— 设置是这个应用里唯一「有内部结构」的场景，把左侧这一列直接交出去，
 * 内容区就能拿回和矩阵 / 概览一样的完整宽度，视线也只需要在一条竖线上。
 *
 * 链接仍是真实的 `<a href>`，只是拦住普通点击改成应用内导航 ——
 * Cmd/Ctrl + 点击照旧开新标签，地址里带着当前结算月（和改造前一致）。
 */
export function AppSidebar({
  route,
  userName,
  hrefs,
  onNavigate,
  settingsTab,
  onSettingsTabChange,
  onSettingsBack
}: AppSidebarProps) {
  const { state } = useSidebar()
  /**
   * 用户浮层改成受控。
   *
   * 非受控时点「设置」只会触发导航，Radix 并不认为发生了「选择」——
   * 它只在点外部、按 Esc、再点触发器时才自行关闭。于是跳进设置页之后
   * 浮层还挂在那里，挡住侧栏底部的用户区和一部分内容。
   * 这里自己管开关：任何一项被点中都先关，再执行动作。
   */
  const [menuOpen, setMenuOpen] = useState(false)

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

  /** 进入设置：整条侧栏让位给设置导航 */
  const inSettings = route === 'settings'

  /**
   * 设置导航的两组。
   *
   * 分「排班 / 应用」而不是平铺：人员配置动的是花名册，JIG DATA 与系统设置
   * 动的是程序本身。顺序按使用频率排 —— 人员配置最常用、JIG DATA 次之、
   * 系统设置（配色 / 备份 / 清空）一年点不了几次，放最下面。
   * JIG DATA 只在桌面壳里出现，条件与画布里的插槽一致（都是 inTauri）。
   */
  const settingsGroups: {
    label: string
    items: { id: SettingsTab; label: string; icon: typeof Users }[]
  }[] = [
    { label: '排班', items: [{ id: 'roster', label: '人员配置', icon: Users }] },
    {
      label: '应用',
      items: [
        ...(showJig ? [{ id: 'jig' as const, label: 'JIG DATA', icon: Table2 }] : []),
        { id: 'system' as const, label: '系统设置', icon: SlidersHorizontal }
      ]
    }
  ]

  return (
    <Sidebar collapsible="icon">
      {/* 壳里的标题栏段与侧栏同一层（不画分隔线），只留折叠按钮；
          品牌字标压到它下面的 .brand-hero，像参考稿那样沉一层。
          浏览器 / 静态版没有自绘标题栏，品牌仍是同一份横向单行排版。 */}
      {inTauri ? <SidebarTitleBar /> : null}

      {inSettings ? (
        /* 设置态：品牌让位给「返回」。设置是这个应用里唯一的二级场景，
         * 左上角的返回就是它的出口，同时也提示「你不在主界面」。
         * 折叠成图标条时只剩箭头，tooltip 补上文字。 */
        <SidebarHeader className="settings-side-head">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onSettingsBack} tooltip="返回">
                <ArrowLeft className="size-4" />
                <span>返回</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
      ) : (
        <SidebarHeader className={inTauri ? 'brand-hero' : undefined}>
          <a
            className="flex items-center rounded-md py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
            href={hrefs.overview}
            onClick={event => intercept(event, 'overview')}
          >
            <BrandLockup collapseText />
          </a>
        </SidebarHeader>
      )}

      <SidebarContent>
        {inSettings ? (
          settingsGroups.map(group => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.items.map(item => {
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          aria-current={settingsTab === item.id ? 'page' : undefined}
                          data-settings-tab={item.id}
                          isActive={settingsTab === item.id}
                          tooltip={item.label}
                          onClick={() => onSettingsTabChange(item.id)}
                        >
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        ) : (
        <>
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
        </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {/*
              底部不再是「设置」入口，而是**用户区**：头像 + 姓名，点开一个浮层。
              设置与退出都在浮层里 —— 底栏只这一处常驻，视觉上比「一个孤零零的
              齿轮图标」更像一个应用。折叠成 44px 图标条时只剩头像。
            */}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <SidebarMenuButton
                  aria-label={`${userName} 的菜单`}
                  className="h-auto py-1.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  size="lg"
                  tooltip={userName}
                >
                  <span aria-hidden="true" className="user-avatar">
                    {userName.slice(0, 1)}
                  </span>
                  <span className="flex min-w-0 flex-col text-left group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-medium">{userName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {route === 'settings' ? '当前在设置页' : '设置与退出'}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-3.5 opacity-60 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                className="user-menu"
                side="top"
                sideOffset={8}
              >
                <button
                  className="user-menu-item"
                  data-view="settings"
                  type="button"
                  onClick={() => {
                    // 先关浮层再导航：已经在设置页时导航是空操作，浮层同样要收起
                    setMenuOpen(false)
                    onNavigate('settings')
                  }}
                >
                  <Settings className="size-4" />
                  设置
                </button>
                {/* 浏览器里没有进程可退，但这一项仍显示（禁用 + 说明），
                    否则浮层只剩一行、看起来像一条导航栏而不是菜单 */}
                <button
                  className="user-menu-item is-danger"
                  disabled={!inTauri}
                  title={inTauri ? undefined : '仅桌面版可退出应用'}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void quitApp()
                  }}
                >
                  <LogOut className="size-4" />
                  退出应用
                </button>
              </PopoverContent>
            </Popover>
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
