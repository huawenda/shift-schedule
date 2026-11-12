import {
  Download,
  FolderOpen,
  Loader,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface JigTopBarProps {
  /** 源文件名（还没载入时为空） */
  sourceName: string
  /** 源文件完整路径，落在 title 提示里 */
  sourcePath: string
  /** 已选中但尚未加载的文件名；null = 没选过 */
  pendingName: string | null
  /** 是否处于「已选未加载」状态（顶栏标「（待加载）」） */
  pendingUnloaded: boolean
  /** 是否正在读文件 */
  busy: boolean
  /** 能否选文件（静态版不行） */
  canPick: boolean
  /** 打开文件选择器 */
  onPick: () => void
  /** 读取已选中的文件 */
  onLoad: () => void
  /** 能否导出（静态版不行，或当前页没数据） */
  canExport: boolean
  /** 导出当前视图 */
  onExport: () => void
  /** 打开型号尺寸映射面板 */
  onOpenSizeMapping: () => void
  /** 打开 JIG 设置 */
  onOpenSettings: () => void
  /** 当前生效的主题；按钮图标与 aria-label 都跟着它变 */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

/**
 * JIG 页的顶栏。
 *
 * 与排班三页的顶栏是两件事：那边是「月份导航 + 备份」，这边的月份毫无意义
 * （JIG 数据来自 MES 导出的 Excel，与哪个月份无关），要的是**源文件**与
 * 针对 JIG 的操作。
 *
 * **「浏览…」与「加载」分成两步**（与原项目一致）：选完先看到文件名与路径，
 * 不满意还能换；点「加载」才真的读。MES 导出的文件动辄几百 KB 到几 MB，
 * 一步到位时选错文件就得从头再走一遍对话框。
 */
export function JigTopBar({
  sourceName,
  sourcePath,
  pendingName,
  pendingUnloaded,
  busy,
  canPick,
  onPick,
  onLoad,
  canExport,
  onExport,
  onOpenSizeMapping,
  onOpenSettings,
  theme,
  onToggleTheme
}: JigTopBarProps) {
  /** 顶栏显示的是「当前选定的文件」：选过没加载时显示待加载的那个 */
  const shownName = pendingName ?? sourceName
  const shownPath = pendingName ?? sourcePath

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      <SidebarTrigger />

      {/* 源文件位置：路径可能很长，截断显示，完整路径走 title 提示 */}
      <div className="flex min-w-0 items-center gap-2">
        <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {shownName ? (
          <span className="truncate text-sm" title={shownPath}>
            {shownName}
            {pendingUnloaded ? (
              <span className="ml-1 text-xs text-muted-foreground">（待加载）</span>
            ) : null}
          </span>
        ) : (
          <span className="truncate text-sm text-muted-foreground">
            尚未选择 MES 导出的 Excel 文件
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          disabled={!canPick || busy}
          onClick={onPick}
          size="sm"
          type="button"
          variant="outline"
        >
          浏览…
        </Button>
        <Button
          disabled={!pendingName || busy}
          onClick={onLoad}
          size="sm"
          type="button"
          variant="outline"
        >
          {busy ? <Loader className="animate-spin" /> : null}
          加载
        </Button>
        <Button
          disabled={!canExport}
          onClick={onExport}
          size="sm"
          type="button"
          variant="outline"
        >
          <Download data-icon="inline-start" />
          导出
        </Button>
        <Button onClick={onOpenSizeMapping} size="sm" type="button" variant="outline">
          <SlidersHorizontal data-icon="inline-start" />
          型号尺寸匹配
        </Button>
        <Button
          aria-label="JIG 设置"
          onClick={onOpenSettings}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Settings />
        </Button>

        {/* 主题切换：图标按钮，跟随当前生效主题换图标（深色时显示太阳，
            点一下回到浅色）。与排班三页的顶栏同一个行为。 */}
        <Button
          aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  )
}
