<template>
  <nav-bar action="今天" @action="onToday" />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }">
    <!-- 今日概览卡 -->
    <view class="paper card card-summary">
      <view class="summary">
        <view class="summary-item">
          <text class="summary-num">{{ summary.day }}</text>
          <text class="summary-label">今日白班</text>
        </view>
        <view class="summary-divider"></view>
        <view class="summary-item">
          <text class="summary-num">{{ summary.night }}</text>
          <text class="summary-label">今日夜班</text>
        </view>
        <view class="summary-divider"></view>
        <view class="summary-item">
          <text class="summary-num">{{ summary.rest }}</text>
          <text class="summary-label">今日休息</text>
        </view>
      </view>
    </view>

    <!-- 矩阵卡：姓名列固定 + 日期区横向滚动（小程序 scroll-view 里 sticky 不生效，改用两栏） -->
    <view class="paper card card-matrix">
      <view class="matrix">
        <view class="names">
          <view class="names-head"><text class="names-title">成员</text></view>
          <view v-for="row in rows" :key="row.id" class="name-row">
            <view class="name-line">
              <text class="name">{{ row.name }}</text>
              <text v-if="row.isSelf" class="badge">本人</text>
            </view>
            <text class="name-sub">{{ row.sub }}</text>
          </view>
        </view>

        <view class="days-wrap">
          <scroll-view class="days" scroll-x :show-scrollbar="false" :scroll-left="scrollLeft">
            <view class="days-inner" :style="daysStyle">
              <view class="day-head" :style="gridStyle">
                <view
                  v-for="day in days"
                  :key="day.key"
                  class="day-cell"
                  :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
                >
                  <text class="day-num">{{ day.day }}</text>
                  <text class="day-week">{{ day.weekday }}</text>
                </view>
              </view>

              <view v-for="row in rows" :key="row.id" class="day-row" :style="gridStyle">
                <view v-for="cell in row.cells" :key="cell.key" class="pill-cell">
                  <view class="pill" :class="'t-' + cell.tone">{{ cell.short }}</view>
                </view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>

    <!-- 图例：直接落在纸面上，不另起卡片 -->
    <view class="legend">
      <view v-for="item in legends" :key="item.label" class="legend-item">
        <view class="legend-dot" :class="'t-' + item.tone">{{ item.short }}</view>
        <text class="legend-text">{{ item.label }}</text>
      </view>
    </view>
  </view>

  <tab-bar :current="1" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import { rosterStore } from '../../store/roster'
import {
  getEffectiveShift,
  getOverrideMap,
  getSelf,
  patternLabelOf,
  type Roster
} from '../../data/roster'
import { getPeriod } from '../../data/period'
import { isWeekend, todayKey, weekdayLabel } from '../../data/dateUtils'
import { SHIFT_META } from '../../data/shifts'

const store = rosterStore
const roster = computed<Roster>(() => store.state.roster)
const period = computed(() => getPeriod(store.state.month))
const today = todayKey()

const days = computed(() => period.value.dates.map(date => ({
  key: date,
  day: date.slice(8, 10),
  weekday: weekdayLabel(date),
  isToday: date === today,
  isWeekend: isWeekend(date)
})))

const rows = computed(() => {
  const currentRoster = roster.value
  const overrideMap = getOverrideMap(currentRoster)
  const self = getSelf(currentRoster)

  return currentRoster.members.map(member => {
    const pattern = patternLabelOf(currentRoster, member)
    const position = member.position || ''
    return {
      id: member.id,
      name: member.name,
      isSelf: member.id === self?.id,
      sub: position ? `${pattern} · ${position}` : pattern,
      cells: period.value.dates.map(date => {
        const shift = getEffectiveShift(currentRoster, member, date, overrideMap)
        return {
          key: member.id + '|' + date,
          short: shift ? SHIFT_META[shift].short : '',
          tone: shift ? SHIFT_META[shift].tone : 'rest'
        }
      })
    }
  })
})

/** 顶部概览：白特并入白班、夜特并入夜班；事假不进概览条 */
const summary = computed(() => {
  const currentRoster = roster.value
  const overrideMap = getOverrideMap(currentRoster)
  const counts = { day: 0, night: 0, rest: 0 }

  currentRoster.members.forEach(member => {
    const shift = getEffectiveShift(currentRoster, member, today, overrideMap)
    if (!shift) return
    if (shift === '白班' || shift === '白特') counts.day += 1
    else if (shift === '夜班' || shift === '夜特') counts.night += 1
    else if (shift === '休息') counts.rest += 1
  })

  return counts
})

const gridDays = computed(() => period.value.dates.length)

/** 列模板：每列都是 minmax(48rpx, 1fr)，容器多出的余量由所有列均分，
 * 于是每列仍等宽，且不会在末尾留白；最后一列不画右边线，避免和卡片边框叠成双线 */
const gridStyle = computed(() => `grid-template-columns: repeat(${gridDays.value}, minmax(48rpx, 1fr))`)
const daysStyle = computed(() => `width: ${Math.round(gridDays.value * 48 * frame.rpx)}px`)

/** 点「今天」时滚到的位置（px） */
const scrollLeft = ref(0)

// 图例只用单字：手机一行放得下六项，写全称会折行
const legends = [
  { short: '白', label: '白班', tone: 'day' },
  { short: '夜', label: '夜班', tone: 'night' },
  { short: '休', label: '休息', tone: 'rest' },
  { short: '特', label: '白特', tone: 'dayx' },
  { short: '特', label: '夜特', tone: 'nightx' },
  { short: '假', label: '事假', tone: 'leave' }
]

/** 今天靠左、前面留两列做上下文；48rpx 是日期列宽 */
function onToday() {
  const index = days.value.findIndex(day => day.isToday)
  if (index < 0) {
    store.goCurrentMonth()
    return
  }
  scrollLeft.value = Math.max(0, (index - 2) * 48 * frame.rpx)
}
</script>

<style lang="scss" scoped>
@import './style.scss';
</style>
