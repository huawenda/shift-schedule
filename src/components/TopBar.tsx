import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { isTauriShell } from '@/platform/env'

interface TopBarProps {
  /** 页面主标题：从页头提到顶栏，页头只留结算月与页面自己的动作 */
  title: string
  /** 当前生效的主题（浅色 / 深色）；按钮图标与 aria-label 都跟着它变 */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

/**
 * 顶栏：左边折叠 / 抽屉开关 + 页面主标题，右边主题开关。
 * 备份的导出 / 导入只保留在设置页，顶栏不再重复。
 *
 * 标题原先在页头（`.canvas-head`）里，与副标题、结算月导航挤在同一行；
 * 现在提到顶栏，页头那行只放结算月与页面动作 —— 视线从上往下是
 * 「我在哪一页 → 看的是哪一期 → 具体内容」。
 */
export function TopBar({ title, theme, onToggleTheme }: TopBarProps) {
  /** 壳里的折叠按钮在自绘标题栏左段（侧栏顶部），顶栏这份只留给浏览器 / 静态版 */
  const inTauri = isTauriShell()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-5">
      {/* 不画底边线：顶栏与画布同底，靠 64px 的留白与内容区自己的间距分界 */}
      {inTauri ? null : <SidebarTrigger />}
      <h1 className="topbar-title">{title}</h1>

      {/* 右列只留主题开关：备份的导出 / 导入统一收在设置页（那里有完整说明），
          顶栏不再重复放两个按钮。 ml-auto 让它贴右缘。 */}
      <div className="ml-auto flex items-center gap-2">
        {/* 主题切换：图标按钮，跟随当前生效主题换图标（深色时显示太阳，
            点一下回到浅色）。设置页另有「外观」三态，这里是快捷入口。 */}
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
