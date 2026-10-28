import { useState } from 'react'
import { SummaryBar } from '../components/SummaryBar'
import { TeamMatrix, type MatrixMode } from '../components/TeamMatrix'
import { formatPeriodRange, type Period } from '../data/period'
import type { Member, Roster } from '../data/roster'

interface MatrixScreenProps {
  roster: Roster
  period: Period
  onEdit: (member: Member, date: string) => void
}

/**
 * 全员矩阵：只讲「全组」的事。
 *
 * 顶部那 4 格概览（今日白班/夜班/休息/出勤）放在这一页而不是日历页 ——
 * 它统计的是全员出勤，与矩阵同源；日历页只讲本人。
 *
 * 视图切换（按班次 / 按姓名）只存在组件 state 里，**不落存储**：
 * 离开这一页再回来就是默认的「按班次」，与 web 端一致。
 */
export function MatrixScreen({ roster, period, onEdit }: MatrixScreenProps) {
  const [mode, setMode] = useState<MatrixMode>('shift')

  return (
    <div className="canvas">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">全员矩阵</h1>
          <p className="canvas-sub">
            {formatPeriodRange(period)} · 共 {period.dates.length} 天 · {roster.members.length} 位成员
          </p>
        </div>

        <div className="canvas-tools">
          <div className="segmented" role="group" aria-label="矩阵视图">
            <button
              aria-pressed={mode === 'shift'}
              className={`segmented-item${mode === 'shift' ? ' is-on' : ''}`}
              type="button"
              onClick={() => setMode('shift')}
            >
              按班次
            </button>
            <button
              aria-pressed={mode === 'name'}
              className={`segmented-item${mode === 'name' ? ' is-on' : ''}`}
              type="button"
              onClick={() => setMode('name')}
            >
              按姓名
            </button>
          </div>
        </div>
      </div>

      <SummaryBar period={period} roster={roster} />

      <TeamMatrix mode={mode} period={period} roster={roster} onEdit={onEdit} />
    </div>
  )
}
