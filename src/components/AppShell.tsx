import { type CSSProperties, type ReactNode } from 'react'

import { type Route } from '@/appLocation'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsCompact } from '@/hooks/use-compact'
import { isTauriShell } from '@/platform/env'
import { JigStatusRail } from '@/features/jig/components/JigStatusRail'
import { JigTopBar } from '@/features/jig/components/JigTopBar'
import type { JigTabId } from '@/features/jig/components/jigTabs'
import { computeViewCounts } from '@/features/jig/core/view'
import type { JigData } from '@/features/jig/hooks/useJigData'
import { LOOKUP_DATA_VERSION } from '@/features/lookup/data/lookupData'
import { AppSidebar } from './AppSidebar'
import { MobileNav } from './MobileNav'
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
  /**
   * JIG 页的数据状态（源文件、选文件回调）。
   * 只有 JIG 页的顶栏用得到，但它是外壳的一部分，所以从 App 一路传下来。
   */
  jig: JigData
  /** JIG 页当前子页 —— 导出「当前视图」要知道导哪一页的表 */
  jigTab: JigTabId
  /** 打开型号尺寸映射面板 */
  onOpenJigSizeMapping: () => void
  /** 打开 JIG 设置 */
  onOpenJigSettings: () => void
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
  jig,
  jigTab,
  onOpenJigSizeMapping,
  onOpenJigSettings,
  children
}: AppShellProps) {
  const isCompact = useIsCompact()
  /** 只有 Tauri 壳是无边框窗口，需要自绘标题栏；浏览器 / 静态版保持原样 */
  const inTauri = isTauriShell()

  return (
    <TooltipProvider>
      {/* --sidebar-width 走 inline style：SidebarProvider 的 ...style 展开在它自己的
          16rem 之后，所以这里传入会覆盖默认值，且不用改 CLI 生成的 sidebar.tsx。
          240px 按顶部品牌区 + 导航项的舒适宽度定；窄屏没有侧栏，
          这个变量留着也不影响布局。 */}
      <SidebarProvider
        className={`h-svh min-h-0 overflow-hidden${inTauri ? ' is-frameless' : ''}`}
        style={{ '--sidebar-width': '240px' } as CSSProperties}
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

        {isCompact ? null : (
          <AppSidebar hrefs={hrefs} route={route} onNavigate={onNavigate} />
        )}

        <SidebarInset
          className={`min-h-0 overflow-hidden${isCompact ? ' pb-[calc(56px+env(safe-area-inset-bottom))]' : ''}${inTauri ? ' is-frameless-inset' : ''}`}
          id="main"
          tabIndex={-1}
        >
          {/* 自绘标题栏的右半条；下面接一块左上角圆角的画布层，
              圆角从 SidebarInset 的缝隙色上透出来，与左侧栏形成三层色差。 */}
          {inTauri ? <ContentTitleBar showBrand={isCompact} /> : null}
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
                onOpenSettings={onOpenJigSettings}
                onOpenSizeMapping={onOpenJigSizeMapping}
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
                atCurrentMonth={atCurrentMonth}
                label={route === 'lookup' ? `数据快照 ${LOOKUP_DATA_VERSION}` : undefined}
                monthTitle={monthTitle}
                onBackup={onBackup}
                onRestore={onRestore}
                onShiftMonth={onShiftMonth}
                onToday={onToday}
                onToggleTheme={onToggleTheme}
                showPeriodNav={route !== 'lookup'}
                theme={theme}
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

        {isCompact ? (
          <MobileNav hrefs={hrefs} route={route} onNavigate={onNavigate} />
        ) : null}
      </SidebarProvider>
    </TooltipProvider>
  )
}
