import { Download, FolderOpen, Moon, Sun, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useIsCompact } from '@/hooks/use-compact'

interface JigTopBarProps {
  /** 当前生效的主题；按钮图标与 aria-label 都跟着它变 */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

/**
 * JIG 页的顶栏。
 *
 * 与排班三页的顶栏是两件事：那边是「月份导航 + 备份」，这边的月份毫无意义
 * （JIG 数据来自 MES 导出的 Excel，与哪个月份无关），要的是**源文件**与针对
 * JIG 的操作。
 *
 * 本轮（P2）只搭骨架：源文件位置显示与三个按钮的位置已经定下来，
 * 「浏览 / 载入 / 导出 / 型号尺寸匹配」的实际行为在后续阶段接上。
 */
export function JigTopBar({ theme, onToggleTheme }: JigTopBarProps) {
  /** 窄屏没有侧栏可折叠，导航在底部标签栏，这个开关不显示 */
  const isCompact = useIsCompact()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      {isCompact ? null : <SidebarTrigger />}

      {/* 源文件位置：路径可能很长，截断显示，完整路径走 title 提示 */}
      <div className="flex min-w-0 items-center gap-2">
        <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span
          className="truncate text-sm text-muted-foreground"
          title="尚未选择文件"
        >
          尚未选择 MES 导出的 Excel 文件
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button disabled size="sm" type="button" variant="outline">
          <Download data-icon="inline-start" />
          导出
        </Button>
        <Button disabled size="sm" type="button" variant="outline">
          <SlidersHorizontal data-icon="inline-start" />
          型号尺寸匹配
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
