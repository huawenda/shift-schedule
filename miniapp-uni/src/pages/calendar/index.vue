<template>
  <nav-bar />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }">
    <!-- 1 月份卡 -->
    <view class="paper card card-month">
      <view class="month-row">
        <view class="month-hit" @tap="onStep(-1)"><view class="month-step">‹</view></view>
        <text class="month-title">{{ month.title }}</text>
        <view class="month-hit" @tap="onStep(1)"><view class="month-step">›</view></view>
      </view>
      <view class="meta-row">
        <text class="range">{{ month.range }} · {{ month.days }} 天</text>
      </view>
    </view>

    <!-- 2 今日卡：墨黑块 -->
    <view class="today-card">
      <view class="today-head">
        <text class="today-label">今天 · {{ today.date }} {{ today.weekday }}</text>
        <text v-if="today.time" class="today-time">{{ today.time }}</text>
      </view>
      <view class="today-main">
        <text class="today-shift">{{ today.shift }}</text>
        <view class="today-flags">
          <text v-if="today.overtime" class="flag flag-ot">{{ today.overtime }}h 加班</text>
          <text v-if="today.legal" class="flag flag-legal">法定</text>
        </view>
      </view>
      <view v-if="today.todos" class="today-foot">
        <text class="today-todo">{{ today.todos }} 项待办</text>
      </view>
    </view>

    <!-- 3 统计卡：同时也是「本月概览」入口 -->
    <view class="paper card card-stats" @tap="onOverview">
      <view class="stats-bar"></view>
      <view class="stats-head">
        <text class="stats-title">本月概览</text>
        <text class="stats-arrow">›</text>
      </view>
      <view class="stats">
        <view class="stat">
          <text class="stat-num">{{ summary.work }}</text>
          <text class="stat-label">出勤</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat">
          <text class="stat-num">{{ summary.overtimeHours }}</text>
          <text class="stat-label">加班</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat">
          <text class="stat-num">{{ summary.todos }}</text>
          <text class="stat-label">待办</text>
        </view>
      </view>
    </view>

    <!-- 4 日历卡（最底部）：星期栏 + 网格 -->
    <view class="paper card card-cal">
      <view class="weekdays">
        <text
          v-for="(weekday, index) in weekdays"
          :key="weekday"
          class="weekday"
          :class="{ 'is-weekend': index === 0 || index === 6 }"
        >{{ weekday }}</text>
      </view>

      <!-- 网格：三行等宽 —— 上排 日号 + 加班/事假，中排 农历 + 法定，下排 班次独占 -->
      <view class="grid">
        <view
          v-for="item in cells"
          :key="item.key"
          class="cell"
          :class="[item.inPeriod ? '' : 'is-outside', item.isToday ? 'is-today' : '']"
          @tap="onCell(item)"
        >
          <text class="cell-day">{{ item.day }}</text>
          <text v-if="item.otText" class="flag flag-ot cell-ot">{{ item.otText }}</text>
          <text v-else-if="item.leaveText" class="flag flag-leave cell-ot">{{ item.leaveText }}</text>
          <view class="cell-mid">
            <text v-if="item.meta" class="cell-meta" :class="{ 'is-festival': item.isFestival }">{{ item.meta }}</text>
            <text v-if="item.legal" class="flag flag-legal">法</text>
          </view>
          <text
            class="cell-char"
            :class="['t-' + item.tone, item.changed ? 'is-changed' : '']"
          >{{ item.shift }}</text>
        </view>
      </view>
    </view>

    <!-- 图例：直接落在纸面上，不另起卡片 -->
    <view class="legend">
      <view class="lg"><view class="sw t-day"></view><text>白班</text></view>
      <view class="lg"><view class="sw t-night"></view><text>夜班</text></view>
      <view class="lg"><view class="sw t-rest"></view><text>休息</text></view>
      <view class="lg"><view class="sw sw-ot"></view><text>加班</text></view>
      <view class="lg"><view class="sw sw-legal"></view><text>法定</text></view>
      <view class="lg"><view class="sw sw-leave"></view><text>事假</text></view>
    </view>
  </view>

  <!-- 当天记录抽屉：班次（加班 / 法定 / 事假时长）+ 待办（DESIGN.md §4.1） -->
  <view v-if="sheet" class="backdrop" @tap="onRequestClose">
    <view class="sheet" @tap.stop="onSheetStop">
      <view class="sheet-head">
        <view class="sheet-head-main">
          <text class="sheet-title">{{ selfName }}</text>
          <text class="sheet-sub">{{ sheet.dateText }} · 默认 {{ sheet.templateLabel }}</text>
        </view>
        <text class="sheet-close" @tap="onRequestClose">关闭</text>
      </view>

      <!-- 两个页签：班次 / 待办 -->
      <view class="tabs">
        <view class="tab" :class="{ 'is-on': sheet.tab === 'shift' }" @tap="sheet.tab = 'shift'">班次</view>
        <view class="tab" :class="{ 'is-on': sheet.tab === 'todo' }" @tap="sheet.tab = 'todo'">
          <text>待办</text>
          <text v-if="sheetTodos.length" class="tab-count">{{ sheetTodos.length }}</text>
        </view>
      </view>

      <!-- 待办页：改动立即生效，不走保存 -->
      <view v-if="sheet.tab === 'todo'" class="sheet-body">
        <view class="todo-add">
          <input
            class="input"
            placeholder="写点什么…"
            :value="todoText"
            maxlength="60"
            confirm-type="done"
            @input="onTodoInput"
            @confirm="onAddTodo"
          />
          <view class="btn is-small" :class="{ 'is-disabled': !todoText.trim() }" @tap="onAddTodo">添加</view>
        </view>

        <text v-if="!sheetTodos.length" class="todo-empty">这一天还没有待办。</text>
        <view v-else class="todo-list">
          <view
            v-for="todo in sheetTodos"
            :key="todo.id"
            class="todo-item"
            :class="['todo-tone-' + todo.tone, { 'is-done': todo.done }]"
          >
            <view class="todo-check" @tap="onToggleTodo(todo)"></view>
            <text class="todo-text" @tap="onToggleTodo(todo)">{{ todo.text }}</text>
            <text class="todo-remove" @tap="onRemoveTodo(todo)">×</text>
          </view>
        </view>

        <text class="todo-tip">待办改动立即生效，不走保存</text>
      </view>

      <!-- 班次页：班次 + 加班 + 法定 + 事假时长，改动走保存 -->
      <view v-else class="sheet-body">
        <view class="shift-grid">
          <view
            v-for="option in shiftOptions"
            :key="option.name"
            class="shift"
            :class="['t-' + option.tone, { 'is-on': sheet.shift === option.name, 'is-blocked': option.blocked }]"
            @tap="onPickShift(option.name)"
          >
            <text class="shift-name">{{ option.name }}</text>
            <text v-if="sheet.shift === option.name" class="shift-check">✓</text>
          </view>
        </view>

        <!-- 事假：只记时长，不记加班与法定 -->
        <view v-if="sheet.shift === '事假'" class="section">
          <view class="section-head">
            <text class="section-title">事假时长</text>
            <text class="section-note">按 {{ leaveHours }} 小时从工资里扣</text>
          </view>
          <view class="seg">
            <view
              v-for="duration in LEAVE_DURATIONS"
              :key="duration"
              class="seg-item"
              :class="{ 'is-on': sheet.leave === duration }"
              @tap="sheet.leave = duration"
            >{{ duration }}</view>
          </view>
        </view>
        <view v-if="sheet.shift === '事假'" class="section">
          <view class="section-head"><text class="section-title">加班与法定</text></view>
          <text class="section-body">事假不记加班，也不参与法定节假日加班费计算。</text>
        </view>

        <!-- 有工时的班次：加班 + 法定 -->
        <view v-if="sheet.shift !== '事假'" class="section" :class="{ 'is-disabled': !overtimeAllowed }">
          <view class="section-head">
            <text class="section-title">加班</text>
            <text v-if="!overtimeAllowed" class="section-note">休息与事假不记加班</text>
            <text v-else-if="missingOvertime" class="section-note">特勤必须记录加班</text>
          </view>
          <view class="ot-row">
            <view class="ot-presets">
              <view
                v-for="hours in presets"
                :key="hours"
                class="chip"
                :class="{ 'is-on': overtimeHours === hours }"
                @tap="onPickPreset(hours)"
              >{{ formatOvertimeHours(hours) }}</view>
              <text v-if="!presets.length" class="ot-empty">—</text>
            </view>
            <view class="ot-input">
              <input
                class="input input-compact"
                type="digit"
                :value="sheet.overtimeText"
                :disabled="!overtimeAllowed"
                @input="onOvertimeInput"
              />
              <text class="ot-unit">小时</text>
            </view>
          </view>
        </view>

        <view v-if="sheet.shift !== '事假'" class="section" :class="{ 'is-disabled': !legalAllowed }">
          <view class="section-head"><text class="section-title">法定节假日</text></view>
          <view class="seg">
            <view class="seg-item" :class="{ 'is-on': !sheet.legal }" @tap="onPickLegal(false)">否</view>
            <view class="seg-item" :class="{ 'is-on': sheet.legal }" @tap="onPickLegal(true)">是</view>
          </view>
        </view>
      </view>

      <!-- 底栏跟着页签走：班次页有恢复 / 取消 / 保存，待办页只有完成 -->
      <view class="sheet-foot">
        <view v-if="confirmDiscard" class="discard">
          <text class="discard-text">有未保存的修改</text>
          <view class="foot-actions">
            <view class="btn" @tap="confirmDiscard = false">继续编辑</view>
            <view class="btn btn-danger" @tap="onCloseSheet">放弃修改</view>
          </view>
        </view>
        <view v-else-if="sheet.tab === 'shift'" class="foot-row">
          <view class="btn is-quiet" :class="{ 'is-disabled': !sheet.hasRecord }" @tap="onRestore">恢复默认</view>
          <view class="foot-actions">
            <view class="btn" @tap="onRequestClose">取消</view>
            <view class="btn btn-primary" :class="{ 'is-disabled': !canSaveShift }" @tap="onSheetSave">保存</view>
          </view>
        </view>
        <view v-else class="foot-row is-end">
          <view class="btn" @tap="onCloseSheet">完成</view>
        </view>
      </view>
    </view>
  </view>

  <tab-bar :current="0" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import { rosterStore } from '../../store/roster'
import { getDayRecord, getRecordMap, getSelf, getTemplateShift, overrideKey } from '../../data/roster'
import { buildCalendarGrid, formatMonthTitle, formatPeriodRange, getPeriod } from '../../data/period'
import { getCalendarMeta } from '../../data/calendarMeta'
import { computeMonthStats } from '../../data/stats'
import { LEAVE_DURATIONS, formatLeaveDuration, leaveHoursOf, type LeaveDuration } from '../../data/leave'
import {
  canMarkLegal,
  canRecordOvertime,
  formatOvertimeHours,
  getOvertimePresets,
  normalizeOvertimeHours
} from '../../data/overtime'
import { todayKey, weekdayLabel } from '../../data/dateUtils'
import { SHIFT_META, type ShiftType } from '../../data/shifts'

const store = rosterStore
const roster = computed(() => store.state.roster)
const self = computed(() => getSelf(roster.value))
const selfName = computed(() => self.value?.name ?? '本人')
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

const month = computed(() => {
  const period = getPeriod(store.state.month)
  return {
    period,
    title: formatMonthTitle(store.state.month),
    range: formatPeriodRange(period),
    days: period.dates.length
  }
})

/** 班次名一定在六种之内，这里的收窄只是给 TS 看 */
function shiftMetaOf(shift: string) {
  return SHIFT_META[shift as keyof typeof SHIFT_META]
}

function clockOf(hour: number) {
  return String(hour % 24).padStart(2, '0') + ':00'
}

/** 35 格：周期内按「改班记录 → 模板」推导，周期外只给模板与日号（淡出） */
const cells = computed(() => {
  const current = self.value
  const records = getRecordMap(roster.value)
  const todayDate = todayKey()

  return buildCalendarGrid(month.value.period).map(cell => {
    const meta = getCalendarMeta(cell.date)
    const record = current && cell.inPeriod ? records.get(overrideKey(current.id, cell.date)) : undefined
    const template = current ? getTemplateShift(roster.value, current, cell.date) : null
    const shift = record?.shift ?? template ?? '休息'
    const overtime = record?.overtimeHours ?? 0

    return {
      key: cell.key,
      date: cell.date,
      day: cell.date.slice(8, 10),
      inPeriod: cell.inPeriod,
      isToday: cell.date === todayDate,
      meta: meta.label,
      isFestival: meta.isFestival,
      shift,
      tone: shiftMetaOf(shift).tone,
      /* 描边只表示「与模板不同」 */
      changed: Boolean(record && record.shift !== template),
      otText: overtime > 0 ? formatOvertimeHours(overtime) : '',
      legal: record?.isLegal === true,
      leaveText: shift === '事假' ? formatLeaveDuration(record?.leaveDuration) : '',
      templateShift: template ?? '休息',
      overtimeHours: overtime,
      leaveDuration: record?.leaveDuration ?? '',
      hasRecord: Boolean(record)
    }
  })
})

const stats = computed(() => (
  self.value ? computeMonthStats(roster.value, self.value, month.value.period) : null
))

const summary = computed(() => ({
  work: stats.value ? stats.value.days.work : 0,
  overtimeHours: stats.value ? stats.value.overtime.total : 0,
  todos: month.value.period.dates.reduce(
    (sum, date) => sum + roster.value.todos.filter(todo => todo.date === date).length,
    0
  )
}))

/** 今日卡：班次、时段、加班 / 法定角标、待办数都从真实记录推 */
const today = computed(() => {
  const date = todayKey()
  const current = self.value
  const record = current ? getDayRecord(roster.value, current.id, date) : undefined
  const shift = current ? (record?.shift ?? getTemplateShift(roster.value, current, date) ?? '休息') : '休息'
  const meta = shiftMetaOf(shift)
  const time = meta.startHour != null && meta.hours != null
    ? `${clockOf(meta.startHour)} – ${clockOf(meta.startHour + meta.hours)}`
    : ''

  return {
    date: `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`,
    weekday: '周' + weekdayLabel(date),
    shift: current ? shift : '—',
    time,
    overtime: record?.overtimeHours || 0,
    legal: record?.isLegal === true,
    todos: roster.value.todos.filter(todo => todo.date === date).length
  }
})

type Sheet = {
  key: string
  date: string
  dateText: string
  template: string
  templateLabel: string
  tab: 'shift' | 'todo'
  shift: string
  original: string
  overtimeText: string
  originOvertime: number
  legal: boolean
  originLegal: boolean
  leave: string
  originLeave: string
  hasRecord: boolean
}

const sheet = ref<Sheet | null>(null)
const confirmDiscard = ref(false)
const todoText = ref('')

const SHIFT_NAMES = ['白班', '夜班', '休息', '白特', '夜特', '事假']

const shiftOptions = computed(() => SHIFT_NAMES.map(name => ({
  name,
  ...shiftMetaOf(name),
  /* 默认班次是休息的日子不存在「请假」这回事 */
  blocked: name === '事假' && sheet.value?.template === '休息'
})))

const overtimeAllowed = computed(() => Boolean(sheet.value && canRecordOvertime(sheet.value.shift as ShiftType)))
const legalAllowed = computed(() => Boolean(sheet.value && canMarkLegal(sheet.value.shift as ShiftType)))
const overtimeHours = computed(() => (
  sheet.value && overtimeAllowed.value ? normalizeOvertimeHours(sheet.value.overtimeText) : 0
))
/** 白特 / 夜特 = 休息日来上班，必然产生加班：不记加班就不允许保存 */
const missingOvertime = computed(() => Boolean(
  sheet.value && (sheet.value.shift === '白特' || sheet.value.shift === '夜特') && overtimeHours.value <= 0
))
const presets = computed(() => (
  sheet.value
    ? getOvertimePresets(sheet.value.shift as ShiftType, Boolean(legalAllowed.value && sheet.value.legal))
    : []
))
const leaveHours = computed(() => (
  sheet.value ? leaveHoursOf(sheet.value.leave as LeaveDuration) : 8
))

const sheetTodos = computed(() => {
  const current = sheet.value
  return current ? roster.value.todos.filter(todo => todo.date === current.date) : []
})

const dirty = computed(() => {
  const current = sheet.value
  if (!current) return false
  const currentLegal = legalAllowed.value && current.legal
  const currentLeave = current.shift === '事假' ? current.leave : '8h'
  return current.shift !== current.original
    || overtimeHours.value !== current.originOvertime
    || currentLegal !== current.originLegal
    || currentLeave !== current.originLeave
})

const canSaveShift = computed(() => Boolean(sheet.value && dirty.value && !missingOvertime.value))

function onOverview() {
  if (!self.value) {
    uni.showToast({ title: '还没有设置本人', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/overview/index' })
}

function onStep(delta: number) {
  store.stepMonth(delta)
}

/** 点格子开抽屉；周期外的格子属于别的月份，不给改 */
function onCell(cell: any) {
  if (!cell.inPeriod || !self.value) return
  sheet.value = {
    key: cell.key,
    date: cell.date,
    dateText: `${Number(cell.date.slice(5, 7))}月${Number(cell.date.slice(8, 10))}日 · 周${weekdayLabel(cell.date)}`,
    template: cell.templateShift,
    templateLabel: cell.templateShift,
    tab: 'shift',
    shift: cell.shift,
    original: cell.shift,
    overtimeText: cell.overtimeHours ? String(cell.overtimeHours) : '',
    originOvertime: cell.overtimeHours || 0,
    legal: cell.legal === true,
    originLegal: cell.legal === true,
    leave: cell.leaveDuration || '8h',
    originLeave: cell.leaveDuration || '8h',
    hasRecord: Boolean(cell.hasRecord)
  }
  confirmDiscard.value = false
  todoText.value = ''
}

/** 换班次时把新班次不支持的值原地清掉，避免切回去又冒出来 */
function onPickShift(name: string) {
  const current = sheet.value
  if (!current) return
  if (name === '事假' && current.template === '休息') {
    uni.showToast({ title: '默认班次是休息，不能请事假', icon: 'none' })
    return
  }
  current.shift = name
  if (!canRecordOvertime(name as ShiftType)) current.overtimeText = ''
  if (!canMarkLegal(name as ShiftType)) current.legal = false
}

function onPickLegal(value: boolean) {
  if (!sheet.value || !legalAllowed.value) return
  sheet.value.legal = value
}

function onOvertimeInput(event: any) {
  if (!sheet.value || !overtimeAllowed.value) return
  sheet.value.overtimeText = event.detail.value
}

function onPickPreset(hours: number) {
  const current = sheet.value
  if (!current || !overtimeAllowed.value) return
  current.overtimeText = overtimeHours.value === hours ? '' : String(hours)
}

function onRequestClose() {
  const current = sheet.value
  if (!current) return
  /* 待办是即时生效的，没有未保存改动要拦 */
  if (current.tab === 'shift' && dirty.value) {
    confirmDiscard.value = true
    return
  }
  onCloseSheet()
}

function onCloseSheet() {
  sheet.value = null
  confirmDiscard.value = false
  todoText.value = ''
}

function onSheetSave() {
  const current = sheet.value
  const member = self.value
  if (!current || !member || !canSaveShift.value) return

  store.saveDay(member.id, current.date, {
    shift: current.shift as ShiftType,
    overtimeHours: overtimeHours.value > 0 ? overtimeHours.value : undefined,
    isLegal: legalAllowed.value && current.legal ? true : undefined,
    leaveDuration: current.shift === '事假' ? (current.leave as LeaveDuration) : undefined
  })

  onCloseSheet()
}

/** 恢复默认：班次回到模板，加班 / 法定 / 事假时长一并清空 */
function onRestore() {
  const current = sheet.value
  const member = self.value
  if (!current || !member || !current.hasRecord) return

  store.resetDay(member.id, current.date)
  onCloseSheet()
}

function onTodoInput(event: any) {
  todoText.value = event.detail.value
}

function onAddTodo() {
  const body = todoText.value.trim()
  const current = sheet.value
  if (!body || !current) return

  store.addTodo(current.date, body)
  todoText.value = ''
}

function onToggleTodo(todo: any) {
  store.toggleTodo(todo.id)
}

function onRemoveTodo(todo: any) {
  store.removeTodo(todo.id)
}

/** 抽屉内部的空点击：挡住遮罩的关闭动作 */
function onSheetStop() {}
</script>

<style lang="scss" scoped>
@import './style.scss';
</style>
