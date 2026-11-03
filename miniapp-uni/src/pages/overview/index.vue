<template>
  <nav-bar />

  <view
    class="page"
    :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }"
  >
    <view class="canvas">
      <view class="canvas-head" :style="{ top: frame.navHeight + 'px' }">
        <view class="head-bar">
          <text class="canvas-title">月度概览</text>
        </view>
        <text class="canvas-sub">{{ subText }}</text>
      </view>

      <today-plaque
        v-if="self && stats"
        :dates="period.dates"
        :default-shifts="selfDefaultShifts"
        :shifts="selfShifts"
        :summary="stats.days"
        :moment="moment"
        :today="today"
        :today-meta="todayMeta"
        :today-todo-count="todayTodoCount"
        :person-name="self.name"
        :person-group="personGroup"
        :today-in-period="todayInPeriod"
        @edit="openEditor"
      />

      <view class="overview-top">
        <month-calendar :cells="cells" @edit="openEditor" />
        <todo-card
          :todos="periodTodos"
          :max-height="todoMaxHeight"
          @toggle="onToggleTodo"
        />
      </view>

      <stats-panels
        v-if="stats"
        :stats="stats"
        :total-days="period.dates.length"
        @open-profile="openProfile"
      />
    </view>
  </view>

  <tab-bar :current="0" />

  <day-editor
    v-if="editorDate && self"
    :member-id="self.id"
    :date="editorDate"
    mode="day"
    @close="editorDate = null"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShareAppMessage } from '@dcloudio/uni-app'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import DayEditor from '../../components/day-editor.vue'
import TodayPlaque from '../../components/today-plaque.vue'
import MonthCalendar from '../../components/month-calendar.vue'
import TodoCard from '../../components/todo-card.vue'
import StatsPanels from '../../components/stats-panels.vue'
import { useCurrentShift } from '../../composables/useCurrentShift'
import { rosterStore } from '../../store/roster'
import {
  getRecordMap,
  getSelf,
  getTemplateShift,
  overrideKey,
  patternLabelOf
} from '../../data/roster'
import { buildCalendarGrid, formatPeriodRange, getPeriod } from '../../data/period'
import { getCalendarMeta } from '../../data/calendarMeta'
import { computeMonthStats } from '../../data/stats'
import { formatLeaveDuration } from '../../data/leave'
import { formatOvertimeHours } from '../../data/overtime'
import { todayKey } from '../../data/dateUtils'
import { SHIFT_META, type ShiftType } from '../../data/shifts'

const store = rosterStore
const today = todayKey()

/** 转发统一用品牌封面，不用页面截图 */
onShareAppMessage(() => ({
  title: '昼夜 · 个人倒班记录本',
  path: '/pages/overview/index',
  imageUrl: '/static/share-card.png'
}))

/** 改班弹层：打开的那一天；null = 关着 */
const editorDate = ref<string | null>(null)

const roster = computed(() => store.state.roster)
const self = computed(() => getSelf(roster.value))
const period = computed(() => getPeriod(store.state.month))
const recordMap = computed(() => getRecordMap(roster.value))

const stats = computed(() => (
  self.value ? computeMonthStats(roster.value, self.value, period.value) : null
))

const personGroup = computed(() => (
  self.value ? patternLabelOf(roster.value, self.value) : ''
))

const subText = computed(() => (
  self.value
    ? `${formatPeriodRange(period.value)} · 共 ${period.value.dates.length} 天 · ${self.value.name} · ${personGroup.value}`
    : `${formatPeriodRange(period.value)} · 共 ${period.value.dates.length} 天 · 还没有设置本人`
))

/** 本期逐日班次：模板 + 改班记录 */
const selfShifts = computed<ShiftType[]>(() => {
  const current = self.value
  if (!current) return period.value.dates.map(() => '休息')
  return period.value.dates.map(date => {
    const record = recordMap.value.get(overrideKey(current.id, date))
    return record?.shift ?? getTemplateShift(roster.value, current, date) ?? '休息'
  })
})

/** 默认班次（模板）：节奏条按它分组 */
const selfDefaultShifts = computed<ShiftType[]>(() => {
  const current = self.value
  if (!current) return period.value.dates.map(() => '休息')
  return period.value.dates.map(date => (
    getTemplateShift(roster.value, current, date) ?? '休息'
  ))
})

const todayInPeriod = computed(() => period.value.dates.includes(today))
const todayMeta = computed(() => getCalendarMeta(today).label)
const todayTodoCount = computed(() => (
  roster.value.todos.filter(todo => todo.date === today).length
))

const moment = useCurrentShift(
  computed(() => period.value.dates),
  computed(() => selfShifts.value)
)

/** 本月内的待办 */
const periodTodos = computed(() => roster.value.todos.filter(todo => (
  todo.date >= period.value.startDate && todo.date <= period.value.endDate
)))

const todoCounts = computed(() => {
  const counts = new Map<string, number>()
  periodTodos.value.forEach(todo => {
    counts.set(todo.date, (counts.get(todo.date) ?? 0) + 1)
  })
  return counts
})

/** 日历格子：与桌面 `MonthCalendar` 同一套字段 */
const cells = computed(() => {
  const current = self.value
  const records = recordMap.value
  return buildCalendarGrid(period.value).map(cell => {
    const record = current && cell.inPeriod ? records.get(overrideKey(current.id, cell.date)) : undefined
    const template = current ? getTemplateShift(roster.value, current, cell.date) : null
    const shift: ShiftType = record?.shift ?? template ?? '休息'
    const meta = getCalendarMeta(cell.date)
    const overtime = record?.overtimeHours ?? 0
    const leaveText = shift === '事假' ? formatLeaveDuration(record?.leaveDuration) : ''

    return {
      key: cell.key,
      date: cell.date,
      day: cell.date.slice(8, 10),
      inPeriod: cell.inPeriod,
      isToday: cell.date === today,
      meta: meta.label,
      isFestival: meta.isFestival,
      shift,
      shiftLabel: SHIFT_META[shift].label,
      tone: SHIFT_META[shift].tone,
      changed: Boolean(record && record.shift !== template),
      otText: overtime > 0 ? formatOvertimeHours(overtime) : '',
      legal: record?.isLegal === true,
      leaveText,
      todoCount: todoCounts.value.get(cell.date) ?? 0
    }
  })
})

/** 待办列表最多占 40% 视口高，和桌面 `40dvh` 一致 */
const todoMaxHeight = Math.round(uni.getWindowInfo().windowHeight * 0.4)

function openEditor(date: string) {
  if (!self.value) {
    uni.showToast({ title: '还没有设置本人', icon: 'none' })
    return
  }
  editorDate.value = date
}

function onToggleTodo(id: string) {
  store.toggleTodo(id)
}

function openProfile() {
  uni.switchTab({ url: '/pages/settings/index' })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--canvas);
  box-sizing: border-box;
}

.overview-top {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
</style>
