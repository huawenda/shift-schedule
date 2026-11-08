import { useRef, type ChangeEvent } from 'react'
import { ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useIsCompact } from '@/hooks/use-compact'

interface TopBarProps {
  monthTitle: string
  /** 当前看的结算月就是本月 —— 「回到本月」这时没有可做的事，置灰 */
  atCurrentMonth: boolean
  onShiftMonth: (delta: number) => void
  onToday: () => void
  onBackup: () => void
  onRestore: (file: File) => void
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
  onRestore
}: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  /** 窄屏没有侧栏可折叠，导航在底部标签栏，这个开关不显示 */
  const isCompact = useIsCompact()

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onRestore(file)
    event.target.value = ''
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      {isCompact ? null : <SidebarTrigger />}

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

      {/* 手机上放不下两个备份按钮；设置页里还有一份入口，这里只在 ≥640px 显示 */}
      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <Button size="sm" type="button" variant="outline" onClick={onBackup}>
          <Download data-icon="inline-start" />
          导出备份
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload data-icon="inline-start" />
          导入备份
        </Button>
        <input
          ref={fileRef}
          accept="application/json,.json"
          className="hidden"
          name="backup-file"
          tabIndex={-1}
          type="file"
          onChange={handleFile}
        />
      </div>
    </header>
  )
}
