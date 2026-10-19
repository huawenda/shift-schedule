import { useEffect, useRef, type CSSProperties } from 'react'
import type { DateLabel, SchedulePerson, ShiftType } from '@shift-schedule/core'
import { ShiftMark } from '../../components/ShiftMark'
import { getShiftClass } from '../../scheduleHelpers'

export type TableMode = 'shift' | 'name'

interface TeamMatrixProps {
  currentUserName: string
  dateLabels: DateLabel[]
  dates: string[]
  editedKeys: Set<string>
  legalKeys: Set<string>
  people: SchedulePerson[]
  tableMode: TableMode
  todayKey: string
  onOpen: (personName: string, date: string) => void
  onTableModeChange: (mode: TableMode) => void
}

const isWeekend = (weekday: string) => weekday === '六' || weekday === '日'

export function TeamMatrix({
  currentUserName,
  dateLabels,
  dates,
  editedKeys,
  legalKeys,
  people,
  tableMode,
  todayKey,
  onOpen,
  onTableModeChange
}: TeamMatrixProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const byName = tableMode === 'name'

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const todayIndex = dates.indexOf(todayKey)
    if (todayIndex < 0) return
    const cellWidth = scroll.querySelector<HTMLElement>('.gh')?.getBoundingClientRect().width ?? 0
    if (cellWidth <= 0) return
    scroll.scrollLeft = Math.max(0, cellWidth * (todayIndex - 1))
  }, [dates, tableMode, todayKey])

  // 桌面端鼠标没有横向滚轮：在矩阵上滚滚轮即横向滚动内容。
  // React 的 onWheel 挂在根节点上且是 passive 的，preventDefault 不生效，
  // 所以这里用原生监听并显式 passive: false。
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    function onWheel(event: WheelEvent) {
      if (event.deltaX !== 0) return
      const max = scroll!.scrollWidth - scroll!.clientWidth
      if (max <= 0) return
      const next = scroll!.scrollLeft + event.deltaY
      // 触边后不再拦截，让页面继续纵向滚动，不把人困在矩阵里
      if ((next <= 0 && scroll!.scrollLeft <= 0) || (next >= max && scroll!.scrollLeft >= max)) return
      event.preventDefault()
      scroll!.scrollLeft = next
    }

    scroll.addEventListener('wheel', onWheel, { passive: false })
    return () => scroll.removeEventListener('wheel', onWheel)
  }, [])

  const rowStyle = { '--days': dates.length } as CSSProperties

  return (
    <section aria-label="全员排班" className={byName ? 'matrix is-by-name' : 'matrix'}>
      <div className="matrix-head">
        <div className="matrix-title">
          <h2>全员排班</h2>
          <span className="sub">{people.length} 人 · {dates.length} 天</span>
        </div>
        <div aria-label="矩阵视图" className="tabs" role="tablist">
          <button
            aria-selected={!byName}
            role="tab"
            type="button"
            onClick={() => onTableModeChange('shift')}
          >
            按班次
          </button>
          <button
            aria-selected={byName}
            role="tab"
            type="button"
            onClick={() => onTableModeChange('name')}
          >
            按姓名
          </button>
        </div>
      </div>

      <div className="matrix-scroll" ref={scrollRef}>
        <div className="matrix-inner">
          <div className="grid-row grid-head" style={rowStyle}>
            <div className="m-name">
              <span>{byName ? '班次' : '姓名'}</span>
            </div>
            {dateLabels.map(label => (
              <div
                className={[
                  'gh',
                  isWeekend(label.weekday) ? 'we' : '',
                  label.date === todayKey ? 'today' : ''
                ].filter(Boolean).join(' ')}
                key={label.date}
              >
                {label.date.slice(3)}
              </div>
            ))}
          </div>

          {people.map(person => (
            <div
              className={`grid-row ${person.name === currentUserName ? 'row-me' : ''}`}
              key={person.name}
              style={rowStyle}
            >
              <div className="m-name">
                {byName ? null : <b>{person.name}</b>}
                <span>{person.group}</span>
              </div>
              {person.shifts.map((shift: ShiftType, index) => {
                const date = dates[index]
                if (!date) return <div className="m-body is-empty" key={index} />

                const key = `${person.name}::${date}`
                // 标记与排班日历保持一致：加班=白点，法定=红点，法定盖过加班，
                // 事假不记录加班所以不标点。is-edited 这个名字是历史遗留。
                const hasLegal = legalKeys.has(key)
                const hasOvertime = shift !== '事假' && (hasLegal || editedKeys.has(key))

                return (
                  <button
                    aria-label={`${person.name} ${date} ${shift}${hasOvertime ? hasLegal ? ' 法定加班' : ' 有加班' : ''}`}
                    className={[
                      'm-body',
                      byName ? 'is-name' : '',
                      !byName && shift === '休息' ? 'is-blank' : '',
                      hasOvertime ? 'is-edited' : '',
                      hasLegal && hasOvertime ? 'is-legal' : ''
                    ].filter(Boolean).join(' ')}
                    key={date}
                    type="button"
                    onClick={() => onOpen(person.name, date)}
                  >
                    {byName
                      ? <span className={`name-pill ${getShiftClass(shift)}`}>{person.name}</span>
                      : <ShiftMark shift={shift} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="matrix-foot">
        <span className="scroll-hint">左滑看更多日期</span>
      </div>
    </section>
  )
}
