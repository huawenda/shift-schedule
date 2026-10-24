import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getMarkClass, shiftInitial, tallyOrder, weekdayLabels } from '../../appConstants'
import { useCurrentShift } from '../../hooks/useCurrentShift'
import { useScheduleData } from '../../hooks/useScheduleData'
import { getDateLabels } from '../../utils/schedule'
import { getSafeTop } from '../../utils/safeArea'
import './index.scss'

/**
 * 今日页（值班白板版）。
 *
 * 只回答一个问题——「我现在什么班、还有多久」。
 * 板头（墨色横档）承担日期与身份；翻页牌的底色就是当前/下一班的
 * 班次磁贴色（颜色是数据不是装饰）；进度用刻度尺而不是胶囊。
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

  // 板头同步签：板头保持墨白 + 信号红三色，不用绿色。
  const syncVisible = data.profileReady && !data.needsBinding
  const syncSyncing = data.refreshing || !data.cloudSyncReady
  const syncState = data.cloudSyncBlocked ? 'is-err' : syncSyncing ? 'is-syncing' : 'is-ok'
  const syncLabel = data.cloudSyncBlocked ? '同步失败' : syncSyncing ? '同步中' : '已同步'

  // 翻页牌底色 = 当前（或下一班）班次磁贴色；本月无排班的空态才用墨底。
  const flapTile = moment.kind === 'idle' ? 'flap-ink' : getMarkClass(moment.shift)

  return (
    <View className="screen screen-with-tabbar today">
      <View className="status-cover" style={{ height: safeTop }} />

      <View className="head" style={{ paddingTop: safeTop }}>
        <View className="head-main">
          <Text className="head-date">{dateLabel}</Text>
          <Text className="head-meta">
            {weekday}
            {data.todayMeta.label ? ` ${data.todayMeta.label}` : ''}
          </Text>
        </View>
        <View className="head-side">
          <View className="head-user">
            <Text className="head-user-name">{data.currentUser?.name ?? ''}</Text>
            <Text className="head-user-group">{data.currentUser?.group ?? ''}</Text>
          </View>
          {syncVisible ? (
            <View
              className={`head-sync ${syncState}`}
              hoverClass={data.cloudSyncBlocked ? 'press-dim' : 'none'}
              onClick={() => { if (data.cloudSyncBlocked) void data.refresh() }}
            >
              <View className="head-sync-dot" />
              <Text>{syncLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className={`flap ${flapTile} stamp-in`}>
        <Text className="flap-state">{moment.kind === 'active' ? '进行中' : '下一班'}</Text>
        <View className="flap-main">
          <Text className="flap-shift">{moment.shift ?? '—'}</Text>
          <View className="flap-cd">
            <Text className="flap-cd-label">{moment.countdownLabel}</Text>
            <View className="flap-cd-row">
              <Text className="flap-cd-num">{moment.countdown?.value ?? '—'}</Text>
              <Text className="flap-cd-unit">{moment.countdown?.unit ?? ''}</Text>
            </View>
          </View>
        </View>
        <Text className="flap-range">{moment.rangeText}</Text>
      </View>
      <View className="ruler">
        <View className="ruler-fill" style={{ width: progress }} />
      </View>

      <View className="sect">
        <View className="sect-title">
          <Text className="sect-title-text">未来 7 天</Text>
          <Text className="sect-title-sub">月历页可整月查看</Text>
        </View>
        <View className="week">
          {upcoming.map(item => (
            <View key={item.date} className={`week-cell ${item.date === data.todayKey ? 'is-today' : ''}`}>
              <Text className="week-wd">{item.weekday}</Text>
              <Text className="week-dd">{item.date.slice(3)}</Text>
              {item.shift ? (
                <View className={`week-band ${getMarkClass(item.shift)}`}>
                  <Text>{shiftInitial[item.shift]}</Text>
                </View>
              ) : <View className="week-band is-empty" />}
            </View>
          ))}
        </View>
      </View>

      <View className="sect">
        <View className="sect-title">
          <Text className="sect-title-text">本月</Text>
          <Text className="sect-title-sub">{data.monthView.people.length} 人 · {data.monthView.dates.length} 天</Text>
        </View>
        <View className="tally">
          {summaryItems.map(item => (
            <View key={item.key} className="tally-item">
              <View className={`tally-chip ${item.shiftClass}`}>
                <Text>{shiftInitial[item.key]}</Text>
              </View>
              <Text className="tally-num">{data.summary?.[item.key] ?? 0}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
