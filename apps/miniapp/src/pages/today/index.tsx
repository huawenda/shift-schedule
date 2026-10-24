import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getShiftClass, shiftInitial, tallyOrder, weekdayLabels } from '../../appConstants'
import { useCurrentShift } from '../../hooks/useCurrentShift'
import { useScheduleData } from '../../hooks/useScheduleData'
import { getDateLabels } from '../../utils/schedule'
import { getSafeTop } from '../../utils/safeArea'
import './index.scss'

/**
 * 今日页（新版首页）。
 *
 * 设计取向：只回答一个问题 ——「我现在什么班、还有多久」。
 * 月历与全员排班移到「月历」tab，统计移到「统计」tab，
 * 首页不再承担「所有信息都在一屏」的职责（那是旧版拥挤的根源）。
 */
export default function Today() {
  useDidShow(() => { Taro.eventCenter.trigger('tab-change', 0) })

  const data = useScheduleData()
  const [safeTop] = useState(() => getSafeTop())
  const moment = useCurrentShift(data.monthView.dates, data.currentUser?.shifts ?? [])

  const dateLabel = `${data.todayDate.getMonth() + 1}月${data.todayDate.getDate()}日`
  const weekday = weekdayLabels[data.todayDate.getDay()]
  const summaryItems = tallyOrder.filter(item => (data.summary?.[item.key] ?? 0) > 0)

  const dateLabels = getDateLabels(data.monthView.startDate, data.monthView.dates)
  const todayIndex = data.monthView.dates.indexOf(data.todayKey)
  const startIndex = todayIndex >= 0 ? todayIndex : 0
  const upcoming = dateLabels.slice(startIndex, startIndex + 7).map((label, offset) => ({
    ...label,
    shift: data.currentUser?.shifts[startIndex + offset]
  }))

  const progress = `${Math.round(moment.progress * 100)}%`

  return (
    <View className="screen screen-with-tabbar today">
      <View className="status-cover" style={{ height: safeTop }} />
      <View className="top" style={{ paddingTop: safeTop }}>
        <View className="top-main">
          <Text className="top-date">{dateLabel}</Text>
          <Text className="top-meta">
            {weekday}
            {data.todayMeta.label ? ` · ${data.todayMeta.label}` : ''}
          </Text>
        </View>
        <View className="top-user">
          <Text className="top-user-name">{data.currentUser?.name ?? ''}</Text>
          <Text className="top-user-group">{data.currentUser?.group ?? ''}</Text>
        </View>
      </View>

      <View className="hero">
        <Text className="hero-state">
          {moment.kind === 'active' ? '进行中' : '下一班'}
        </Text>
        <View className="hero-main">
          <Text className="hero-shift">{moment.shift ?? '—'}</Text>
          <View className="hero-cd">
            <Text className="hero-cd-label">{moment.countdownLabel}</Text>
            <View className="hero-cd-row">
              <Text className="hero-cd-num">{moment.countdown?.value ?? '—'}</Text>
              <Text className="hero-cd-unit">{moment.countdown?.unit ?? ''}</Text>
            </View>
          </View>
        </View>
        <Text className="hero-range">{moment.rangeText}</Text>
        <View className="hero-progress">
          <View className="hero-progress-fill" style={{ width: progress }} />
        </View>
      </View>

      <View className="block-title">
        <Text className="block-title-text">未来 7 天</Text>
        <Text className="block-title-sub">滑动月历可看整月</Text>
      </View>
      <View className="week">
        {upcoming.map(item => (
          <View key={item.date} className={`week-cell ${item.date === data.todayKey ? 'is-today' : ''}`}>
            <Text className="week-wd">{item.weekday}</Text>
            <Text className="week-dd">{item.date.slice(3)}</Text>
            {item.shift ? (
              <View className={`week-mark ${getShiftClass(item.shift)}`}>
                <Text>{shiftInitial[item.shift]}</Text>
              </View>
            ) : <View className="week-mark is-empty" />}
          </View>
        ))}
      </View>

      <View className="block-title">
        <Text className="block-title-text">本月</Text>
        <Text className="block-title-sub">{data.monthView.people.length} 人 · {data.monthView.dates.length} 天</Text>
      </View>
      <View className="stats">
        {summaryItems.map(item => (
          <View key={item.key} className="stat">
            <View className={`stat-dot ${item.shiftClass}`} />
            <Text className="stat-num">{data.summary?.[item.key] ?? 0}</Text>
            <Text className="stat-label">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
