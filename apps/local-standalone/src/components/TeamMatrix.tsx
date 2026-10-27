import { getEffectiveShift, getOverrideMap, isEdited, patternLabelOf, type Member, type Roster } from '../data/roster'
import type { Period } from '../data/period'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatDayNumber, isWeekend, todayKey, weekdayLabel } from '../data/dateUtils'

interface TeamMatrixProps {
  roster: Roster
  period: Period
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onEdit: (member: Member, date: string) => void
}

/**
 * 全员矩阵：姓名列固定，日期列平铺。
 *
 * 列宽在 22px 以下是读不了的，所以窄屏交给横向滚动，不压缩字号。
 */
export function TeamMatrix({ roster, period, selectedMemberId, onSelectMember, onEdit }: TeamMatrixProps) {
  const today = todayKey()
  const overrideMap = getOverrideMap(roster)
  const dayCount = period.dates.length

  if (roster.members.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">还没有成员</p>
        <p className="empty-text">先在设置里加上成员和对应的班序，这里就会出现整月的排班。</p>
      </div>
    )
  }

  return (
    <section className="matrix" aria-label="全员排班矩阵">
      <div className="matrix-scroll" style={{ ['--days' as string]: dayCount }}>
        <div className="matrix-head">
          <div className="matrix-name-cell">成员</div>
          <div className="matrix-days">
            {period.dates.map(date => (
              <div
                className={`matrix-day${isWeekend(date) ? ' is-weekend' : ''}${date === today ? ' is-today' : ''}`}
                key={date}
              >
                <span className="matrix-day-num">{formatDayNumber(date)}</span>
                <span className="matrix-day-week">{weekdayLabel(date)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="matrix-body">
          {roster.members.map(member => (
            <div
              className={`matrix-row${member.id === selectedMemberId ? ' is-selected' : ''}`}
              key={member.id}
            >
              <button
                className="matrix-name-cell"
                type="button"
                title={`${member.name} · ${patternLabelOf(roster, member)}`}
                onClick={() => onSelectMember(member.id)}
              >
                <span className="matrix-name">{member.name}</span>
                <span className="matrix-pattern">{patternLabelOf(roster, member)}</span>
              </button>

              <div className="matrix-days">
                {period.dates.map(date => {
                  const shift: ShiftType | null = getEffectiveShift(roster, member, date, overrideMap)
                  const edited = isEdited(member.id, date, overrideMap)
                  const isToday = date === today

                  return (
                    <button
                      className={[
                        'matrix-cell',
                        shift ? shiftToneClass(shift) : 'is-blank',
                        edited ? 'is-edited' : '',
                        isToday ? 'is-today' : ''
                      ].filter(Boolean).join(' ')}
                      key={date}
                      title={shift ? `${member.name} ${date} ${SHIFT_META[shift].label}${edited ? '（已改）' : ''}` : ''}
                      type="button"
                      onClick={() => onEdit(member, date)}
                    >
                      {shift ? SHIFT_META[shift].short : '—'}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="matrix-legend">
        {SHIFT_TYPES.map(shift => (
          <span className="legend-item" key={shift}>
            <span className={`legend-swatch ${shiftToneClass(shift)}`} aria-hidden="true" />
            {SHIFT_META[shift].label}
          </span>
        ))}
        <span className="legend-hint">点格子改班 · 带圆点的是改过的日子</span>
      </div>
    </section>
  )
}
