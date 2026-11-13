import { type CSSProperties, type ReactNode } from 'react'

import { ROUTE_TITLE, type Route } from '@/appLocation'
import type { SettingsTab } from '@/screens/SettingsScreen'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isTauriShell } from '@/platform/env'
import { JigStatusRail } from '@/features/jig/components/JigStatusRail'
import { JigTopBar } from '@/features/jig/components/JigTopBar'
import type { JigTabId } from '@/features/jig/components/jigTabs'
import { computeViewCounts } from '@/features/jig/core/view'
import type { JigData } from '@/features/jig/hooks/useJigData'
import { AppSidebar } from './AppSidebar'
import { ContentTitleBar } from './TitleBar'
import { TopBar } from './TopBar'

/**
 * Route 的定义在 appLocation —— 路由解析与外壳共用同一份，避免两处各说各话。
 * 这里再导出一次，是为了让「外壳的 props 类型」与「路由的类型」保持一个出处，
 * 外部按 `from '@/components/AppShell'` 取 Route 的老写法不用改。
 */
export type { Route }

interface AppShellProps {
  route: Route
  /** 三个入口的 href：由 App 生成，带上当前结算月，修饰键开新标签也能落到同一个月份 */
  hrefs: Record<Route, string>
  onNavigate: (route: Route) => void
  /** 当前生效的主题；顶栏主题按钮的图标与 aria-label 跟着它变 */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  /**
   * JIG 页的数据状态（源文件、选文件回调）。
   * 只有 JIG 页的顶栏用得到，但它是外壳的一部分，所以从 App 一路传下来。
   */
  jig: JigData
  /** JIG 页当前子页 —— 导出「当前视图」要知道导哪一页的表 */
  jigTab: JigTabId
  /** 侧栏底部用户区显示的名字（本人姓名） */
  userName: string
  /** 设置页当前分页 —— 进入设置后侧栏整体切换成设置导航 */
  settingsTab: SettingsTab
  onSettingsTabChange: (tab: SettingsTab) => void
  children: ReactNode
}

/**
 * 外壳：shadcn Sidebar + 顶栏 + 平铺内容区。
 *
 * 改造前是深青 L 形外框（228px 侧栏 + 48px 顶栏 + 缩进 8px 的白色画布浮层）。
 * 现在整块换成默认形态：侧栏由 `Sidebar` 提供（折叠、快捷键、cookie 记忆），
 * 画布直接铺在 `SidebarInset` 里，不再有外框、圆角与投影。
 *
 * **本分支只做宽屏**：没有窄屏响应式。侧栏永远常驻、展开 224px、折叠 48px，
 * 不随窗口收缩，也不会换成底部标签栏或抽屉；内容区窄了由各自的滚动容器消化，
 * 靠容器查询重排，不按视口宽度切整套版式。
 *
 * 高度处理：`h-svh` 而不是 `100vh`。移动浏览器的 `100vh` 是「地址栏收起后的最大高度」，
 * 地址栏展开时比可视区高，页面于是能向下滚几十像素；`svh` 拿到的始终是小视口高度。
 * 下面层层 `min-h-0` 是为了让内容区真的能收缩，`.canvas` 的 `overflow: auto` 才会生效。
 */
export function AppShell({
  route,
  hrefs,
  onNavigate,
  theme,
  onToggleTheme,
  jig,
  jigTab,
  userName,
  settingsTab,
  onSettingsTabChange,
  children
}: AppShellProps) {
  /** 只有 Tauri 壳是无边框窗口，需要自绘标题栏；浏览器 / 静态版保持原样 */
  const inTauri = isTauriShell()

  return (
    <TooltipProvider>
      {/* --sidebar-width 走 inline style：SidebarProvider 的 ...style 展开在它自己的
          16rem 之后，所以这里传入会覆盖默认值，且不用改 CLI 生成的 sidebar.tsx。
          224px 按顶部品牌区 + 导航项的舒适宽度定，折叠 48px（图标条），
          任何窗口宽度都不变。 */}
      <SidebarProvider
        className={`h-svh min-h-0 overflow-hidden${inTauri ? ' is-frameless' : ''}`}
        style={{ '--sidebar-width': '224px', '--sidebar-width-icon': '48px' } as CSSProperties}
      >
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

        <AppSidebar
          hrefs={hrefs}
          route={route}
          settingsTab={settingsTab}
          userName={userName}
          onNavigate={onNavigate}
          onSettingsBack={() => onNavigate('overview')}
          onSettingsTabChange={onSettingsTabChange}
        />

        <SidebarInset
          className={`min-h-0 overflow-hidden${inTauri ? ' is-frameless-inset' : ''}`}
          id="main"
          tabIndex={-1}
        >
          {/* 自绘标题栏的右半条；下面接一块左上角圆角的画布层，
              圆角从 SidebarInset 的缝隙色上透出来，与左侧栏形成三层色差。 */}
          {inTauri ? <ContentTitleBar /> : null}
          <div className={inTauri ? 'canvas-layer' : 'canvas-layer canvas-layer--web'}>
            {/*
              JIG 页有自己的顶栏：月份导航对它毫无意义（数据来自 MES 导出的
              Excel，与结算月无关），要的是源文件与 JIG 专属操作。
            */}
            {route === 'jig' ? (
              <JigTopBar
                busy={jig.busy}
                canExport={jig.canExport && computeViewCounts(jig, jigTab).current > 0}
                canPick={jig.canPick}
                onExport={() => void jig.exportCurrent(jigTab)}
                onLoad={() => void jig.loadSource()}
                onPick={() => void jig.pickSource()}
                onToggleTheme={onToggleTheme}
                pendingName={jig.pendingName}
                pendingUnloaded={jig.pendingUnloaded}
                sourceName={jig.sourceName}
                sourcePath={jig.sourcePath}
                theme={theme}
              />
            ) : (
              <TopBar
                onToggleTheme={onToggleTheme}
                theme={theme}
                title={ROUTE_TITLE[route]}
              />
            )}
            {children}

            {/*
              底部状态轨：JIG 页专属。

              放在画布层里、页面之外 —— 它要贴着窗口底边通栏，
              页面有 padding 且自身占满剩余高度，插进页面就得跟着内缩。

              行数口径走 `computeViewCounts`：页签徽标与这行必须是同一个数，
              两处各算一遍必然漂移。
            */}
            {route === 'jig' ? (
              <JigStatusRail
                currentRows={computeViewCounts(jig, jigTab).current}
                log={jig.log}
                sourceRows={jig.sourceRows}
                status={jig.status}
              />
            ) : null}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
