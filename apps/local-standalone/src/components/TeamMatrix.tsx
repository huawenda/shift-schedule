import { useEffect, useRef } from 'react'
import { getEffectiveShift, getOverrideMap, isSelf, patternLabelOf, type Member, type Roster } from '../data/roster'
import type { Period } from '../data/period'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatDayNumber, isWeekend, todayKey, weekdayLabel } from '../data/dateUtils'

/** 矩阵视图：按班次（格子里一个班次字）/ 按姓名（格子里写人名，底色仍是班次色） */
export type MatrixMode = 'shift' | 'name'

interface TeamMatrixProps {
  roster: Roster
  period: Period
  /** 视图。按姓名时行头让位给班序，姓名搬进格子 */
  mode: MatrixMode
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
 *
 * 两种视图的区别（与 web 端一致，**没有**转置或分组）：
 * - 按班次：格子写「白 / 夜 / 休 / 特 / 假」，行头是「姓名 + 班序 · 岗位」。
 * - 按姓名：格子写这个人的姓名（底色仍是班次色），行头只留「班序 · 岗位」。
 *   于是竖着读一列 = 这天谁上什么班（名字 + 颜色），横着读一行 = 这个人的整月。
 *   日期列下限 56px（放得下 3–4 个汉字），富余宽度平分给各列。
 *
 * 横向滚动条被彻底隐藏了（见 `styles/schedule.scss` 的 `.matrix-scroll`），
 * 改为「鼠标在矩阵范围内滚滚轮 → 横滚」，见下面的 wheel 监听。
 */
export function TeamMatrix({ roster, period, mode, onEdit }: TeamMatrixProps) {
  const today = todayKey()
  const overrideMap = getOverrideMap(roster)
  const dayCount = period.dates.length
  const byName = mode === 'name'
  const scrollRef = useRef<HTMLDivElement>(null)

  // 滚动条藏了，就得让滚轮能横滚：有横向溢出时把 deltaY 转成 scrollLeft。
  // 滚到两端就放行（不 preventDefault），页面继续纵向滚，不把人困在矩阵里。
  // 触控板的原生横滚（deltaX ≠ 0）不拦，交给浏览器。
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    function onWheel(event: WheelEvent) {
      if (event.deltaX !== 0) return
      const max = scroll!.scrollWidth - scroll!.clientWidth
      if (max <= 0) return
      const next = scroll!.scrollLeft + event.deltaY
      if ((next <= 0 && scroll!.scrollLeft <= 0) || (next >= max && scroll!.scrollLeft >= max)) return
      event.preventDefault()
      scroll!.scrollLeft = next
    }

    scroll.addEventListener('wheel', onWheel, { passive: false })
    return () => scroll.removeEventListener('wheel', onWheel)
  }, [])

  if (roster.members.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">还没有成员</p>
        <p className="empty-text">先在设置里加上成员和对应的班序，这里就会出现整月的排班。</p>
      </div>
    )
  }

  return (
    <section className={`matrix${byName ? ' is-by-name' : ''}`} aria-label="全员排班矩阵">
      <div className="matrix-scroll" ref={scrollRef} style={{ ['--days' as string]: dayCount }}>
        <div className="matrix-head">
          {/* 按姓名视图的行头只剩班序，所以表头文案也跟着换 */}
          <div className="matrix-name-cell">{byName ? '班序' : '成员'}</div>
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
            const patternText = [patternLabelOf(roster, member), member.position].filter(Boolean).join(' · ')
            // 按姓名时姓名已经写进每个格子，行头再写一遍就是重复
            const nameContent = byName ? (
              <>
                <span className="matrix-pattern">{patternText}</span>
                {selfRow ? <span className="badge-self">本人</span> : null}
              </>
            ) : (
              <>
                <span className="matrix-name-line">
                  <span className="matrix-name">{member.name}</span>
                  {selfRow ? <span className="badge-self">本人</span> : null}
                </span>
                <span className="matrix-pattern">{patternText}</span>
              </>
            )

            return (
            <div className={`matrix-row${selfRow ? ' is-self' : ''}`} key={member.id}>
              <div
                className={`matrix-name-cell${selfRow ? ' is-self' : ''}`}
                title={`${member.name} · ${patternText}`}
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
                      {shift ? (byName ? member.name : SHIFT_META[shift].short) : '—'}
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
