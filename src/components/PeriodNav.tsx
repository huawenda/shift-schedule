import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PeriodNavProps {
  /** 「2026 年 11 月」这类标题，由 formatMonthTitle 生成 */
  monthTitle: string
  /** 当前看的结算月就是本月 —— 「回到本月」这时没有可做的事，置灰 */
  atCurrentMonth: boolean
  onShiftMonth: (delta: number) => void
  onToday: () => void
}

/**
 * 结算月导航：`‹ 2026 年 11 月 ›` +「回到本月」。
 *
 * 原先挂在顶栏左侧，与导出 / 导入按钮同一行；顶栏改成放页面主标题之后，
 * 它下移到页头（`.canvas-head`）左侧，和「按班次 / 按姓名」这类页面动作同一行。
 * 三步（上一期 / 标题 / 下一期）与「回到本月」是同一件事，所以仍包在一个胶囊里。
 */
export function PeriodNav({
  monthTitle,
  atCurrentMonth,
  onShiftMonth,
  onToday
}: PeriodNavProps) {
  return (
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
  )
}
