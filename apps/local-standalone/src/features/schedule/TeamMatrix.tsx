import { useEffect, useRef, type CSSProperties } from 'react'
import type { DateLabel, SchedulePerson, ShiftType } from '@local/core'
import { ShiftMark } from '../../components/ShiftMark'
import { getShiftClass } from '../../scheduleHelpers'

export type TableMode = 'shift' | 'name'

interface TeamMatrixProps {
  currentUserName: string
  dateLabels: DateLabel[]
  dates: string[]
  editedKeys: Set<string>
  /** 有加班记录的「人::日期」，用于格子上打点 */
  overtimeKeys?: Set<string>
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
  overtimeKeys,
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

  /* 桌面端只有纵向滚轮：矩阵装不下时才把纵向滚轮转成横向，
     能一屏放下就不劫持，否则整页会滚不动。 */
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    function handleWheel(event: WheelEvent) {
      const maxScroll = node!.scrollWidth - node!.clientWidth
      if (maxScroll <= 1) return
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      node!.scrollLeft += event.deltaY
      event.preventDefault()
    }

    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
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

                return (
                  <button
                    aria-label={`${person.name} ${date} ${shift}`}
                    className={[
                      'm-body',
                      byName ? 'is-name' : '',
                      !byName && shift === '休息' ? 'is-blank' : '',
                      editedKeys.has(`${person.name}::${date}`) ? 'is-edited' : '',
                      overtimeKeys?.has(`${person.name}::${date}`) ? 'has-overtime' : ''
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
        <span className="muted">
          {byName ? '药片本色=班次 · 点格改班' : '浅绿=休息 · 点格改班'}
        </span>
        <span className="scroll-hint">左滑看更多日期</span>
      </div>
    </section>
  )
}
