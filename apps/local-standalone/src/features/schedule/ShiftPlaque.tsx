import type { CSSProperties } from 'react'
import type { ShiftSummary, ShiftType } from '@local/core'
import { formatShortDate, weekdayLabels } from '../../appConstants'
import { getShiftClass } from '../../scheduleHelpers'
import type { ShiftMoment } from '../../hooks/useCurrentShift'

interface ShiftPlaqueProps {
  dates: string[]
  endDate: string
  moment: ShiftMoment
  personGroup: string
  personName: string
  shifts: ShiftType[]
  startDate: string
  summary: ShiftSummary
  todayLabel: string
  todayMetaLabel: string
}

type TallyKey = '白班' | '夜班' | '休息' | '白特' | '夜特' | '事假'

const tallyOrder: Array<{ key: TallyKey; label: string; shiftClass: string }> = [
  { key: '白班', label: '白班', shiftClass: 's-day' },
  { key: '夜班', label: '夜班', shiftClass: 's-night' },
  { key: '休息', label: '休', shiftClass: 's-rest' },
  { key: '白特', label: '白特', shiftClass: 's-dayx' },
  { key: '夜特', label: '夜特', shiftClass: 's-nightx' },
  { key: '事假', label: '事假', shiftClass: 's-leave' }
]

export function ShiftPlaque({
  dates,
  endDate,
  moment,
  personGroup,
  personName,
  shifts,
  startDate,
  summary,
  todayLabel,
  todayMetaLabel
}: ShiftPlaqueProps) {
  const tallyItems = tallyOrder.filter(item => (summary[item.key] ?? 0) > 0)
  const progress = `${Math.round(moment.progress * 100)}%`

  return (
    <section aria-label="当前班次" className="plaque">
      <div className="plaque-top">
        <div>
          <span className="p-label">{moment.kind === 'active' ? '现在' : '下一班'}</span>
          <h2 className="shift-name">{moment.shift}</h2>
          <p className="shift-range">{moment.rangeText}</p>
        </div>

        <div>
          <span className="p-label">{moment.countdownLabel}</span>
          {moment.countdown ? (
            <p className="cd-value">
              {moment.countdown.value}
              <small>{moment.countdown.unit}</small>
              {moment.countdownTail ? (
                <>
                  {moment.countdownTail.value}
                  <small>{moment.countdownTail.unit}</small>
                </>
              ) : null}
            </p>
          ) : (
            <p className="cd-value">—</p>
          )}
          <div className="progress">
            <i style={{ width: progress }} />
            <em style={{ left: progress }} />
          </div>
        </div>

        <div>
          <span className="p-label">本月</span>
          <div className="tally">
            {tallyItems.map(item => (
              <div key={item.key}>
                <i className={item.shiftClass} />
                <b>{summary[item.key] ?? 0}</b>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="today-line">
            今天 <b>{todayLabel}</b> {weekdayLabels[new Date().getDay()]}
            {todayMetaLabel ? ` · ${todayMetaLabel}` : ''}
          </p>
        </div>
      </div>

      <div className="rhythm-wrap">
        <div className="rhythm-head">
          <span>{personName} {personGroup}</span>
          <span>{formatShortDate(startDate)} → {formatShortDate(endDate)}</span>
        </div>
        <div className="rhythm" style={{ '--days': dates.length } as CSSProperties}>
          {shifts.map((shift, index) => (
            <i
              className={`${getShiftClass(shift)}${dates[index] === moment.dateKey ? ' is-today' : ''}`}
              key={`${dates[index]}-${index}`}
              title={`${dates[index]} ${shift}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
