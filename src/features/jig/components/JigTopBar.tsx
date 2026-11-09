import {
  Download,
  FolderOpen,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useIsCompact } from '@/hooks/use-compact'

interface JigTopBarProps {
  /** 源文件名（还没载入时为空） */
  sourceName: string
  /** 源文件完整路径，落在 title 提示里 */
  sourcePath: string
  /** 是否正在读文件 */
  busy: boolean
  /** 能否选文件（静态版不行） */
  canPick: boolean
  /** 打开文件选择器 */
  onPick: () => void
  /** 能否导出（静态版不行） */
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
 */
export function JigTopBar({
  sourceName,
  sourcePath,
  busy,
  canPick,
  onPick,
  canExport,
  onExport,
  onOpenSizeMapping,
  onOpenSettings,
  theme,
  onToggleTheme
}: JigTopBarProps) {
  /** 窄屏没有侧栏可折叠，导航在底部标签栏，这个开关不显示 */
  const isCompact = useIsCompact()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      {isCompact ? null : <SidebarTrigger />}

      {/* 源文件位置：路径可能很长，截断显示，完整路径走 title 提示 */}
      <div className="flex min-w-0 items-center gap-2">
        <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {sourceName ? (
          <span className="truncate text-sm" title={sourcePath}>
            {sourceName}
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
