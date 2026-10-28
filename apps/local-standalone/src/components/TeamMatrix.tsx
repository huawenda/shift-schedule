import { getEffectiveShift, getOverrideMap, isSelf, patternLabelOf, type Member, type Roster } from '../data/roster'
import type { Period } from '../data/period'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatDayNumber, isWeekend, todayKey, weekdayLabel } from '../data/dateUtils'

interface TeamMatrixProps {
  roster: Roster
  period: Period
  onEdit: (member: Member, date: string) => void
}

/**
 * 全员矩阵：姓名列固定，日期列平铺。
 *
 * 格子**只显示班次单字**，不加任何「改过 / 有加班」的标记 ——
 * 矩阵是扫一眼看谁上什么班的视图，多一个小点就会让人以为那格有别的含义。
 * 想看某天有没有加班，去个人日历或者点开格子。
 *
 * 本人那一行带「本人」标记、姓名不可点：日历已经锁定本人，
 * 点别人的名字再跳日历这条路已经不存在了。格子本身仍可改（全组总览要能维护）。
 *
 * 列宽在 22px 以下是读不了的，所以窄屏交给横向滚动，不压缩字号。
 */
export function TeamMatrix({ roster, period, onEdit }: TeamMatrixProps) {
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
          {roster.members.map(member => {
            const selfRow = isSelf(roster, member.id)
            const nameContent = (
              <>
                <span className="matrix-name-line">
                  <span className="matrix-name">{member.name}</span>
                  {selfRow ? <span className="badge-self">本人</span> : null}
                </span>
                <span className="matrix-pattern">{patternLabelOf(roster, member)}</span>
              </>
            )

            return (
            <div className={`matrix-row${selfRow ? ' is-self' : ''}`} key={member.id}>
              <div
                className={`matrix-name-cell${selfRow ? ' is-self' : ''}`}
                title={`${member.name} · ${patternLabelOf(roster, member)}`}
              >
                {nameContent}
              </div>

              <div className="matrix-days">
                {period.dates.map(date => {
                  const shift: ShiftType | null = getEffectiveShift(roster, member, date, overrideMap)
                  const isToday = date === today

                  return (
                    <button
                      className={[
                        'matrix-cell',
                        shift ? shiftToneClass(shift) : 'is-blank',
                        isToday ? 'is-today' : ''
                      ].filter(Boolean).join(' ')}
                      key={date}
                      title={shift ? `${member.name} ${date} ${SHIFT_META[shift].label}` : ''}
                      type="button"
                      onClick={() => onEdit(member, date)}
                    >
                      {shift ? SHIFT_META[shift].short : '—'}
                    </button>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      <div className="matrix-legend">
        {SHIFT_TYPES.map(shift => (
          <span className="legend-item" key={shift}>
            <span className={`legend-swatch ${shiftToneClass(shift)}`} aria-hidden="true" />
            {SHIFT_META[shift].label}
          </span>
        ))}
      </div>
    </section>
  )
}
