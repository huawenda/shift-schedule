import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
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
 * 本人那一行带「本人」标记。点成员列的姓名**只聚焦整行**（再点取消），
 * 不跳个人日历 —— 日历已经锁定本人，点名字跳日历那条路已经不存在了。
 * 格子本身仍可改（全组总览要能维护）。
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
  /** 聚焦行：同一时间只高亮一行，再点同一个人取消 */
  const [focusedId, setFocusedId] = useState<string | null>(null)
  /**
   * 键盘游标：整张矩阵只保留一个 tab stop，进入后用方向键在单元格间移动。
   * col = -1 表示行首「姓名 / 班序」单元格。
   */
  const [cursor, setCursor] = useState({ row: 0, col: 0 })
  /** 右侧是否还有没滚出来的日期列：决定边缘渐隐显不显示 */
  const [edgeVisible, setEdgeVisible] = useState(false)

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

  // 横向滚动条藏了，右边还有没有内容就完全没有提示 ——
  // 溢出时在右缘压一层渐隐，滚到头自动消失（见 .matrix-edge）。
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    function update() {
      const max = scroll!.scrollWidth - scroll!.clientWidth
      setEdgeVisible(max > 0 && scroll!.scrollLeft < max - 1)
    }

    update()
    scroll.addEventListener('scroll', update)
    const observer = new ResizeObserver(update)
    observer.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [mode])

  if (roster.members.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">还没有成员</p>
        <p className="empty-text">先在设置里加上成员和对应的班序，这里就会出现整月的排班。</p>
      </div>
    )
  }

  const lastRow = roster.members.length - 1
  const lastCol = dayCount - 1
  const cursorRow = Math.min(cursor.row, lastRow)
  const cursorCol = Math.min(cursor.col, lastCol)

  /** 方向键在矩阵内移动焦点；行首姓名格与日期格之间也能左右切换 */
  function onGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const cell = target.closest<HTMLElement>('[data-cell]')
    if (!cell) return

    const [rawRow, rawCol] = (cell.dataset.cell ?? '0:0').split(':').map(Number)
    let row = rawRow
    let col = rawCol

    switch (event.key) {
      case 'ArrowRight':
        col = col < 0 ? 0 : Math.min(lastCol, col + 1)
        break
      case 'ArrowLeft':
        col = col <= 0 ? -1 : col - 1
        break
      case 'ArrowDown':
        row = Math.min(lastRow, row + 1)
        break
      case 'ArrowUp':
        row = Math.max(0, row - 1)
        break
      default:
        return
    }

    event.preventDefault()
    setCursor({ row, col })
    event.currentTarget
      .querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)
      ?.focus({ preventScroll: false })
  }

  const cellTabIndex = (row: number, col: number) => (row === cursorRow && col === cursorCol ? 0 : -1)
  const syncCursor = (row: number, col: number) => setCursor({ row, col })

  return (
    <section className={`matrix${byName ? ' is-by-name' : ''}`} aria-label="全员排班矩阵">
      <div className="matrix-frame">
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

        <div className="matrix-body" onKeyDown={onGridKeyDown}>
          {roster.members.map((member, rowIndex) => {
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
            <div
              className={`matrix-row${selfRow ? ' is-self' : ''}${focusedId === member.id ? ' is-focused' : ''}`}
              key={member.id}
            >
              <button
                aria-label={`${member.name} ${patternText}，${focusedId === member.id ? '取消聚焦整行' : '聚焦整行'}`}
                aria-pressed={focusedId === member.id}
                className={`matrix-name-cell${selfRow ? ' is-self' : ''}`}
                data-cell={`${rowIndex}:-1`}
                tabIndex={cellTabIndex(rowIndex, -1)}
                title={`${member.name} · ${patternText}（${focusedId === member.id ? '点击取消聚焦' : '点击聚焦整行'}）`}
                type="button"
                onFocus={() => syncCursor(rowIndex, -1)}
                onClick={() => setFocusedId(current => (current === member.id ? null : member.id))}
              >
                {nameContent}
              </button>

              <div className="matrix-days">
                {period.dates.map((date, colIndex) => {
                  const shift: ShiftType | null = getEffectiveShift(roster, member, date, overrideMap)
                  const isToday = date === today
                  const shiftLabel = shift ? SHIFT_META[shift].label : '无班次'

                  return (
                    <button
                      aria-label={`${member.name} ${date} ${shiftLabel}`}
                      className={[
                        'matrix-cell',
                        shift ? shiftToneClass(shift) : 'is-blank',
                        isToday ? 'is-today' : ''
                      ].filter(Boolean).join(' ')}
                      data-cell={`${rowIndex}:${colIndex}`}
                      key={date}
                      tabIndex={cellTabIndex(rowIndex, colIndex)}
                      title={shift ? `${member.name} ${date} ${shiftLabel}` : ''}
                      type="button"
                      onFocus={() => syncCursor(rowIndex, colIndex)}
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
        <div className={`matrix-edge${edgeVisible ? '' : ' is-hidden'}`} aria-hidden="true" />
      </div>

      <div className="matrix-legend">
        {SHIFT_TYPES.map(shift => (
          <span className="legend-item" key={shift}>
            <span className={`legend-swatch ${shiftToneClass(shift)}`} aria-hidden="true" />
            {SHIFT_META[shift].label}
          </span>
        ))}
        {byName ? <span className="legend-hint">横向滚动查看整月</span> : null}
      </div>
    </section>
  )
}
