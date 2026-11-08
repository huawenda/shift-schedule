import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'
import { getEffectiveShift, getOverrideMap, type Member, type Roster } from '../data/roster'
import type { ShiftType } from '../data/shifts'
import type { Period } from '../data/period'

interface SummaryBarProps {
  roster: Roster
  period: Period
  /** 工作日：夜班跨零点时停在夜班开始那天，不按日历日 */
  date: string
}

type CountKey = 'day' | 'night' | 'rest'

interface PersonEntry {
  member: Member
  /** 特勤标记：白特并入白班、夜特并入夜班后，靠这个在名单里区分 */
  special: '白特' | '夜特' | null
}

interface Cell {
  label: string
  value: number | null
  hint: string
  /** 当天这个班次的人（按成员表顺序），浮层里列完整名单 */
  people: PersonEntry[]
}

/**
 * 白特并入白班、夜特并入夜班；事假不进概览条，所以映射里刻意没有它。
 * `special` 只用于名单标记，不影响人数归类。
 */
const SHIFT_GROUP: Partial<Record<ShiftType, { key: CountKey; special: PersonEntry['special'] }>> = {
  白班: { key: 'day', special: null },
  白特: { key: 'day', special: '白特' },
  夜班: { key: 'night', special: null },
  夜特: { key: 'night', special: '夜特' },
  休息: { key: 'rest', special: null }
}

/** 名单里的一枚「特」标记：白特用暖黄、夜特用橙，与矩阵里的班次色同一套 */
function SpecialBadge({ special }: { special: PersonEntry['special'] }) {
  if (!special) return null
  return (
    <span
      aria-label="特勤"
      className={`summary-special${special === '夜特' ? ' is-night' : ''}`}
      title={special === '白特' ? '白班特勤' : '夜班特勤'}
    >
      特
    </span>
  )
}

/**
 * 概览条：三格，只数人不算工时。
 *
 * 白特 / 夜特并进对应的普通班次计数，名单里用「特」标出特勤人员；
 * 卡片固定只放「班次 + 人数 + 一行姓名摘要 + 查看名单」，
 * 完整名单放进点击展开的浮层，不让姓名长度参与卡片宽度计算。
 */
export function SummaryBar({ roster, period, date }: SummaryBarProps) {
  const [openLabel, setOpenLabel] = useState<string | null>(null)
  /**
   * 浮层宽度按旧标准：桌面取**格子的一半**（最小窗口下格子约 392.7px → 浮层约 196px）。
   * 浮层被 Radix 挂到 body 上，百分比不再相对格子，所以打开时量一次格子的宽度，
   * 写进 CSS 变量由样式表消费。≤1023 由样式表改成固定值，这个变量就不生效。
   */
  const [panelWidth, setPanelWidth] = useState<number | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  /**
   * 两套实现并存：
   * - 手机（≤639）用旧的自绘浮层：它绝对定位在概览条里，能靠 left/right: 0
   *   贴满整条概览条，手机上三格只有约 120px，按格子对齐会伸出屏幕外；
   * - 桌面 / 平板（>639）用 shadcn `Popover`：Esc、点外部关闭、焦点归位、碰撞避让都自带。
   */
  const isMobile = useIsMobile()

  /** 自绘浮层没有 Radix 兜底，Esc 与「点外部关闭」得自己处理（仅手机） */
  useEffect(() => {
    if (!isMobile || !openLabel) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenLabel(null)
    }

    function onMouseDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.summary-popover') || target.closest('.summary-more')) return
      setOpenLabel(null)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [isMobile, openLabel])

  function openPanel(label: string) {
    const cell = moreRef.current?.parentElement
    const width = cell ? Math.round(cell.getBoundingClientRect().width / 2) : null
    setPanelWidth(width)
    setOpenLabel(label)
  }
  const inPeriod = period.dates.includes(date)
  const overrideMap = getOverrideMap(roster)

  const groups: Record<CountKey, PersonEntry[]> = {
    day: [],
    night: [],
    rest: []
  }

  if (inPeriod) {
    roster.members.forEach(member => {
      const shift: ShiftType | null = getEffectiveShift(roster, member, date, overrideMap)
      if (!shift) return
      const group = SHIFT_GROUP[shift]
      if (group) groups[group.key].push({ member, special: group.special })
    })
  }

  const groupCell = (label: string, key: CountKey): Cell => ({
    label,
    value: inPeriod ? groups[key].length : null,
    hint: '人',
    people: groups[key]
  })

  const cells: Cell[] = [
    groupCell('今日白班', 'day'),
    groupCell('今日夜班', 'night'),
    groupCell('今日休息', 'rest')
  ]

  return (
    <section className="summary" aria-label="今日概览">
      {cells.map(cell => {
        const open = openLabel === cell.label
        const preview = cell.people.slice(0, 3)
        const popoverId = `summary-popover-${cell.label}`
        /* 两套浮层共用同一份名单内容 */
        const peopleList = (
          <ul className="summary-popover-list">
            {cell.people.map(entry => (
              <li className="summary-popover-item" key={entry.member.id}>
                <span className="summary-popover-name">
                  {entry.member.name}
                  <SpecialBadge special={entry.special} />
                </span>
                {/* 岗位始终占位：没填就显示一条短横线，名单右侧不会空一截 */}
                <span className={`summary-popover-position${entry.member.position ? '' : ' is-empty'}`}>
                  {entry.member.position || '-'}
                </span>
              </li>
            ))}
          </ul>
        )

        return (
          <div className="summary-cell" key={cell.label}>
            <span className="summary-label">{cell.label}</span>
            <span className="summary-value">
              {cell.value === null ? '—' : cell.value}
              <span className="summary-unit">{cell.value === null ? '' : cell.hint}</span>
            </span>
            {cell.people.length > 0 ? (
              <>
                <p className="summary-names" title={cell.people.map(entry => entry.member.name).join('、')}>
                  {preview.map((entry, index) => (
                    <span key={entry.member.id}>
                      {index > 0 ? '、' : ''}
                      {entry.member.name}
                    </span>
                  ))}
                  {cell.people.length > preview.length ? '等' : ''}
                </p>
                {isMobile ? (
                  /* 手机：旧的自绘浮层。它绝对定位在概览条里，能靠 left/right: 0
                     贴满整条概览条 —— 三格在手机上一格只有约 120px，按格子对齐的
                     320px 浮层会从第二格左缘伸出屏幕外。 */
                  <>
                    <button
                      aria-controls={popoverId}
                      aria-expanded={open}
                      aria-haspopup="dialog"
                      className="summary-more"
                      type="button"
                      onClick={() => setOpenLabel(current => (current === cell.label ? null : cell.label))}
                    >
                      查看名单 ›
                    </button>
                    {open ? (
                      <section
                        aria-label={`${cell.label}人员`}
                        className="summary-popover"
                        id={popoverId}
                        role="dialog"
                        tabIndex={-1}
                      >
                        <header className="summary-popover-head">
                          <h3 className="summary-popover-title">{cell.label}</h3>
                          <span className="summary-popover-count">{cell.people.length} 人</span>
                          <button
                            aria-label="关闭名单"
                            className="summary-popover-close"
                            type="button"
                            onClick={() => setOpenLabel(null)}
                          >
                            ×
                          </button>
                        </header>
                        {peopleList}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <Popover
                    open={open}
                    onOpenChange={next => {
                      if (next) openPanel(cell.label)
                      else setOpenLabel(null)
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        aria-label={`${cell.label}人员名单`}
                        className="summary-more"
                        ref={moreRef}
                        type="button"
                      >
                        查看名单 ›
                      </button>
                    </PopoverTrigger>
                    {/* 浮层由 Radix 定位到 body：Esc、点外部关闭、焦点归位、碰撞避让都自带。
                        ring-1 在本项目主题层下解析成透明，这里显式换成 1px 边框；
                        宽度交给样式表（桌面=格子一半，≤1023=min(320px, 100vw-24px)）。 */}
                    <PopoverContent
                      align="start"
                      className="summary-popover-panel gap-0 overflow-hidden p-0 ring-0"
                      collisionPadding={8}
                      sideOffset={6}
                      style={panelWidth ? ({ '--summary-panel-w': `${panelWidth}px` } as CSSProperties) : undefined}
                    >
                      <header className="summary-popover-head">
                        <h3 className="summary-popover-title">{cell.label}</h3>
                        <span className="summary-popover-count">{cell.people.length} 人</span>
                      </header>
                      {peopleList}
                    </PopoverContent>
                  </Popover>
                )}
              </>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
