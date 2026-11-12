import { useRef, type ChangeEvent } from 'react'
import { ChevronLeft, ChevronRight, Download, Moon, Sun, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface TopBarProps {
  monthTitle: string
  /** 当前看的结算月就是本月 —— 「回到本月」这时没有可做的事，置灰 */
  atCurrentMonth: boolean
  onShiftMonth: (delta: number) => void
  onToday: () => void
  onBackup: () => void
  onRestore: (file: File) => void
  /** 当前生效的主题（浅色 / 深色）；按钮图标与 aria-label 都跟着它变 */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  /** 与月份无关的页面（速查）传 false，隐藏月份胶囊 */
  showPeriodNav?: boolean
  /** showPeriodNav=false 时占位的说明文字 */
  label?: string
}

/**
 * 顶栏：左边折叠/抽屉开关 + 月份导航，右边导出/导入备份。
 *
 * 月份三步（上一期 / 标题 / 下一期）与「回到本期」是同一件事，所以包在一个胶囊里；
 * 单独拎出去做按钮会像第二个工具，而且它只在切走后才能点。
 */
export function TopBar({
  monthTitle,
  atCurrentMonth,
  onShiftMonth,
  onToday,
  onBackup,
  onRestore,
  theme,
  onToggleTheme,
  showPeriodNav = true,
  label,
}: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onRestore(file)
    event.target.value = ''
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      <SidebarTrigger />

      {showPeriodNav ? (
        <div className="flex items-center gap-0.5 rounded-lg border border-border px-0.5 py-0.5">
          <Button
            aria-label="上一期"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onShiftMonth(-1)}
          >
            <ChevronLeft />
          </Button>
          <span
            aria-live="polite"
            className="min-w-28 px-1 text-center text-sm font-medium tabular-nums"
          >
            {monthTitle}
          </span>
          <Button
            aria-label="下一期"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onShiftMonth(1)}
          >
            <ChevronRight />
          </Button>
          <Button
            className="ml-0.5"
            disabled={atCurrentMonth}
            size="sm"
            type="button"
            variant="secondary"
            onClick={onToday}
          >
            回到本月
          </Button>
        </div>
      ) : label ? (
        <span className="px-1 text-sm text-muted-foreground">{label}</span>
      ) : null}

      {/* 右列：备份按钮（<640px 隐藏，设置页里还有一份入口）+ 主题按钮（常驻）。
          ml-auto 挂在这一整组上，不能给两个子元素各挂一个 —— 两个 ml-auto
          会把剩余空间对半分，主题按钮被推到中间而不是贴右缘。 */}
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 sm:flex">
          <Button size="sm" type="button" variant="outline" onClick={onBackup}>
            <Download data-icon="inline-start" />
            导出备份
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload data-icon="inline-start" />
            导入备份
          </Button>
        </div>
        <input
          ref={fileRef}
          accept="application/json,.json"
          className="hidden"
          name="backup-file"
          tabIndex={-1}
          type="file"
          onChange={handleFile}
        />

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
