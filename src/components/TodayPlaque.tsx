import { Fragment, useMemo } from 'react'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { SHIFT_META, type ShiftType } from '../data/shifts'
import type { ShiftDayCounts } from '../data/stats'
import type { ShiftMoment } from '../hooks/useCurrentShift'

interface TodayPlaqueProps {
  dates: string[]
  /** 默认班次（模板）：节奏条按它分组，白特/夜特归进默认休息组 */
  defaultShifts: ShiftType[]
  shifts: ShiftType[]
  summary: ShiftDayCounts
  moment: ShiftMoment
  today: string
  todayMeta: string
  todayTodoCount: number
  personName: string
  personGroup: string
  todayInPeriod: boolean
  onEditDate: (date: string) => void
}

/** 本月色点的顺序与标签，与值班牌第三列一致 */
type TallyKey = 'day' | 'night' | 'rest' | 'daySpecial' | 'nightSpecial' | 'leave'

const TALLY: Array<{ key: TallyKey; label: string; tone: string }> = [
  { key: 'day', label: '白班', tone: 'day' },
  { key: 'night', label: '夜班', tone: 'night' },
  { key: 'rest', label: '休', tone: 'rest' },
  { key: 'daySpecial', label: '白特', tone: 'dayx' },
  { key: 'nightSpecial', label: '夜特', tone: 'nightx' },
  { key: 'leave', label: '事假', tone: 'leave' }
]

/**
 * 今日值班牌：现代替概览页标题下那条白色四格条。
 *
 * 三列回答三件事：现在/下一班是什么、还有多久、这个月怎么排；
 * 下方节奏条把整期 30/31 天铺成一排，今天那格用 1px 亮边圈出来。
 * 深青底与外壳同一个色系，是画布上唯一的暗块。
 */
export function TodayPlaque({
  dates,
  defaultShifts,
  shifts,
  summary,
  moment,
  today,
  todayMeta,
  todayTodoCount,
  personName,
  personGroup,
  todayInPeriod,
  onEditDate
}: TodayPlaqueProps) {
  const tallyItems = TALLY.filter(item => summary[item.key] > 0)
  const progress = `${Math.round(moment.progress * 100)}%`

  /** 节奏条按默认班次切成连续组：同组内 2px，组间 8px */
  const rhythmRuns = useMemo(() => {
    const runs: Array<{ key: ShiftType; items: Array<{ date: string; shift: ShiftType }> }> = []
    dates.forEach((date, index) => {
      const base = defaultShifts[index] ?? '休息'
      const shift = shifts[index] ?? '休息'
      const last = runs[runs.length - 1]
      if (last && last.key === base) last.items.push({ date, shift })
      else runs.push({ key: base, items: [{ date, shift }] })
    })
    return runs
  }, [dates, defaultShifts, shifts])

  const shiftLabel = !todayInPeriod
    ? '本期'
    : moment.kind === 'active'
      ? '现在'
      : moment.kind === 'idle'
        ? '本月'
        : '下一班'
  const shiftName = !todayInPeriod || moment.kind === 'idle' ? '—' : moment.shift
  // 跨零点的夜班属于昨天：把日期带上，避免让人以为这是今天的班
  const rangeText = todayInPeriod
    ? moment.kind === 'active' && moment.dateKey !== today
      ? `${formatMonthDay(moment.dateKey)} ${moment.rangeText}`
      : moment.rangeText
    : `本期 ${dates.length} 天 · 今天不在本期`
  /** 跨零点的夜班可能属于昨天；昨天不在本期时只展示，不提供在这里改 */
  const canEditMoment = todayInPeriod && moment.kind !== 'idle' && dates.includes(moment.dateKey)

  const todayLine = [
    `今天 ${formatMonthDay(today)} 周${weekdayLabel(today)}`,
    todayMeta,
    todayTodoCount > 0 ? `待办 ${todayTodoCount} 项` : ''
  ].filter(Boolean).join(' · ')

  return (
    <section aria-label="今日值班牌" className="plaque">
      <div className="plaque-top">
        <div className="plaque-cell">
          <span className="plaque-label">{shiftLabel}</span>
          {canEditMoment ? (
            <button
              aria-label={`修改 ${formatMonthDay(moment.dateKey)} 的班次`}
              className="plaque-shift"
              type="button"
              onClick={() => onEditDate(moment.dateKey)}
            >
              {shiftName}
            </button>
          ) : (
            <span className="plaque-shift is-static">{shiftName}</span>
          )}
          <p className="plaque-range">{rangeText}</p>
        </div>

        <div className="plaque-cell">
          <span className="plaque-label">{todayInPeriod ? moment.countdownLabel : '今天'}</span>
          {todayInPeriod && moment.countdown ? (
            <p className="plaque-cd">
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
            <p className="plaque-cd is-text">{todayInPeriod ? '—' : '不在本期'}</p>
          )}
          <div className="plaque-progress" aria-hidden="true">
            <i style={{ width: progress }} />
            <em style={{ left: progress }} />
          </div>
        </div>

        <div className="plaque-cell">
          <span className="plaque-label">本月</span>
          <div className="plaque-tally">
            {tallyItems.map(item => (
              <div key={item.key}>
                <i aria-hidden="true" className={`is-${item.tone}`} />
                <b>{summary[item.key]}</b>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="plaque-today">{todayLine}</p>
        </div>
      </div>

      <div className="plaque-rhythm-wrap">
        <div className="plaque-rhythm-head">
          <span>{personName} {personGroup}</span>
          <span>
            {formatMonthDay(dates[0])} → {formatMonthDay(dates[dates.length - 1])}
          </span>
        </div>
        <div
          aria-label={`本期 ${dates.length} 天班次节奏`}
          className="plaque-rhythm"
          role="img"
        >
          {rhythmRuns.map((run, runIndex) => (
            <Fragment key={`${run.key}-${runIndex}`}>
              {runIndex > 0 ? <span aria-hidden="true" className="plaque-rhythm-gap" /> : null}
              {run.items.map(item => (
                <i
                  aria-hidden="true"
                  className={`is-${SHIFT_META[item.shift].tone}${item.date === today ? ' is-today' : ''}`}
                  key={item.date}
                  title={`${formatMonthDay(item.date)} ${SHIFT_META[item.shift].label}`}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}
