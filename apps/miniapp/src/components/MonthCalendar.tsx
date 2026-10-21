import { Text, View } from '@tarojs/components'
import { getShiftClass, shiftInitial, shiftLabels, weekdayLabels } from '../appConstants'
import type { CalendarCell } from '../utils/schedule'

interface Props {
  monthLabel: string
  cells: CalendarCell[]
  todayKey: string
  overtimeDates: Set<string>
  legalDates: Set<string>
  slideClassName: string
  onOpenShiftEditor: (date: string) => void
  onSwipe: (deltaX: number) => void
}

/** 与 Web 端 MonthCalendar.tsx 对应；用 flex 取代 grid，用真实节点取代 ::after。 */
export default function MonthCalendar({
  monthLabel,
  cells,
  todayKey,
  overtimeDates,
  legalDates,
  slideClassName,
  onOpenShiftEditor,
  onSwipe
}: Props) {
  const handleTouchEnd = (event: any) => {
    const start = event.touches?.[0]?.clientX
    const end = event.changedTouches?.[0]?.clientX
    if (typeof start !== 'number' || typeof end !== 'number') return

    onSwipe(end - start)
  }

  return (
    <View className="cal-wrap">
      <View className="sec-head">
        <Text className="sec-title">排班日历</Text>
        <Text className="sec-sub">{monthLabel} · 点日期改班</Text>
      </View>

      <View className="cal-weekdays">
        {weekdayLabels.map(label => (
          <Text key={label} className="cal-wd">
            {label}
          </Text>
        ))}
      </View>

      <View className={`cal ${slideClassName}`} onTouchEnd={handleTouchEnd}>
        {cells.map((cell, index) => {
          const hasLegal = legalDates.has(cell.key)
          const hasOvertime = cell.shift !== '事假' && (hasLegal || overtimeDates.has(cell.key))
          const weekdayIndex = index % 7
          const cellClasses = [
            'cal-cell',
            weekdayIndex === 0 ? 'first-of-week' : '',
            weekdayIndex === 6 ? 'last-of-week' : ''
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <View
              key={cell.key}
              className={cellClasses}
              onClick={() => cell.inCurrentMonth && onOpenShiftEditor(cell.key)}
            >
              <View
                className={[
                  'cell-face',
                  cell.shift ? getShiftClass(cell.shift) : '',
                  cell.inCurrentMonth ? '' : 'is-ghost',
                  cell.key === todayKey ? 'is-today' : '',
                  hasOvertime ? 'has-overtime' : '',
                  hasLegal ? 'has-legal' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {hasOvertime ? (
                  <View className={`mark-dot ${hasLegal ? 'mark-dot-legal' : 'mark-dot-ot'}`} />
                ) : null}
                <Text className="cell-day">{cell.day}</Text>
                <Text className={`cell-lunar ${cell.meta.isHoliday ? 'holiday' : ''}`}>{cell.meta.label}</Text>
                {cell.shift ? <Text className="cell-shift">{shiftInitial[cell.shift]}</Text> : null}
              </View>
            </View>
          )
        })}
      </View>

      <View className="cal-foot">
        <View className="legend">
          {shiftLabels.map(shift => (
            <View key={shift} className="legend-item">
              <View className={`swatch ${getShiftClass(shift)}`} />
              <Text className="legend-item-text">{shift}</Text>
            </View>
          ))}
        </View>
        <View className="legend legend-marks">
          <View className="legend-item">
            <View className="ot-dot" />
            <Text className="legend-item-text">加班</Text>
          </View>
          <View className="legend-item">
            <View className="legal-dot" />
            <Text className="legend-item-text">法定</Text>
          </View>
        </View>
      </View>
    </View>
  )
}