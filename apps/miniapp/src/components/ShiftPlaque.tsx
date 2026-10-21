import { Text, View } from '@tarojs/components'
import { formatShortDate, getShiftClass, tallyOrder } from '../appConstants'
import type { ShiftMoment } from '../hooks/useCurrentShift'
import type { ShiftType } from '../types/schedule'

interface Summary {
  [key: string]: number | undefined
  白班?: number
  夜班?: number
  休息?: number
  白特?: number
  夜特?: number
  事假?: number
}

interface Props {
  moment: ShiftMoment
  shiftName: string
  summary: Summary
  startDate: string
  endDate: string
  personName: string
  personGroup: string
  dates: string[]
  shifts: ShiftType[]
  todayLabel: string
  todayWeekday: string
  todayMetaLabel: string
}

/**
 * 与 Web 端 ShiftPlaque.tsx 对应。
 * Web 上是三列网格，手机端按 Web 的移动端断点堆叠为三格纵向排布。
 */
export default function ShiftPlaque({
  moment,
  shiftName,
  summary,
  startDate,
  endDate,
  personName,
  personGroup,
  dates,
  shifts,
  todayLabel,
  todayWeekday,
  todayMetaLabel
}: Props) {
  const tallyItems = tallyOrder.filter(item => (summary[item.key] ?? 0) > 0)
  const progress = `${Math.round(moment.progress * 100)}%`

  return (
    <View className="plaque">
      <View className="plaque-cell first">
        <Text className="p-label">{moment.kind === 'active' ? '现在' : '下一班'}</Text>
        <Text className="shift-name">{shiftName}</Text>
        <Text className="shift-range">{moment.rangeText}</Text>
      </View>

      <View className="plaque-cell">
        <Text className="p-label">{moment.countdownLabel}</Text>
        {moment.countdown ? (
          <View className="cd-value">
            <Text>{moment.countdown.value}</Text>
            <Text className="cd-unit">{moment.countdown.unit}</Text>
            {moment.countdownTail ? (
              <Text className="cd-tail">
                {moment.countdownTail.value}
                {moment.countdownTail.unit}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="cd-value">
            <Text className="cd-tail">—</Text>
          </View>
        )}
        <View className="progress">
          <View className="progress-fill" style={{ width: progress }} />
          {moment.kind === 'active' ? (
            <View className="progress-now" style={{ left: progress }} />
          ) : null}
        </View>
      </View>

      <View className="plaque-cell">
        <Text className="p-label">本月</Text>
        <View className="tally">
          {tallyItems.map(item => (
            <View key={item.key} className="tally-item">
              <View className={`tally-chip ${item.shiftClass}`} />
              <Text className="tally-count">{summary[item.key] ?? 0}</Text>
              <Text className="tally-label">{item.label}</Text>
            </View>
          ))}
        </View>
        <Text className="today-line">
          今天 <Text className="today-line-value">{todayLabel}</Text> {todayWeekday}
          {todayMetaLabel ? ` · ${todayMetaLabel}` : ''}
        </Text>
      </View>

      <View className="rhythm-wrap">
        <View className="rhythm-head">
          <Text>
            {personName} {personGroup}
          </Text>
          <Text>
            {formatShortDate(startDate)} → {formatShortDate(endDate)}
          </Text>
        </View>
        <View className="rhythm">
          {shifts.map((shift, index) => (
            <View
              key={dates[index]}
              className={`rhythm-bar ${getShiftClass(shift)}${dates[index] === moment.dateKey ? ' is-today' : ''}`}
            />
          ))}
        </View>
      </View>
    </View>
  )
}