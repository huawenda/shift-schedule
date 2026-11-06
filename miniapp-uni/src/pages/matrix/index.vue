<template>
  <nav-bar />

  <view
    class="page"
    :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }"
  >
    <view class="canvas">
      <view class="canvas-head" :style="{ top: frame.navHeight + 'px' }">
        <view class="head-bar">
          <text class="canvas-title">全员矩阵</text>
          <view class="canvas-tools">
            <view class="segmented">
              <view
                class="segmented-item"
                :class="{ 'is-on': mode === 'shift' }"
                @tap="mode = 'shift'"
              >按班次</view>
              <view
                class="segmented-item"
                :class="{ 'is-on': mode === 'name' }"
                @tap="mode = 'name'"
              >按姓名</view>
            </view>
          </view>
        </view>
        <text class="canvas-sub">{{ subText }}</text>
      </view>

      <!-- 今日概览条：三格深青，只数人不算工时 -->
      <view class="summary">
        <view
          v-for="(cell, index) in summaryCells"
          :key="cell.key"
          class="summary-cell"
          :class="{ 'is-last': index === 2 }"
        >
          <text class="summary-label">{{ cell.label }}</text>
          <view class="summary-value">
            <text class="summary-num">{{ cell.value === null ? '—' : cell.value }}</text>
            <text v-if="cell.value !== null" class="summary-unit">人</text>
          </view>
          <template v-if="cell.people.length > 0">
            <text class="summary-names">{{ cell.previewText }}</text>
            <view class="summary-more" @tap="togglePopover(cell.key)">查看名单 ›</view>

            <view v-if="openKey === cell.key" class="summary-popover">
              <view class="summary-popover-head">
                <text class="summary-popover-title">{{ cell.label }}</text>
                <text class="summary-popover-count">{{ cell.people.length }} 人</text>
                <view class="summary-popover-close" @tap="openKey = null">×</view>
              </view>
              <scroll-view
                scroll-y
                class="summary-popover-list"
                :style="{ maxHeight: cell.listHeight + 'px' }"
              >
                <view
                  v-for="(person, personIndex) in cell.people"
                  :key="person.id"
                  class="summary-popover-item"
                  :class="{ 'is-last': personIndex === cell.people.length - 1 }"
                >
                  <view class="summary-popover-name">
                    <text>{{ person.name }}</text>
                    <text
                      v-if="person.special"
                      class="summary-special"
                      :class="{ 'is-night': person.special === '夜特' }"
                    >特</text>
                  </view>
                  <text v-if="person.position" class="summary-popover-position">{{ person.position }}</text>
                </view>
              </scroll-view>
            </view>
          </template>
        </view>

        <!-- 点浮层以外任何地方都关闭 -->
        <view v-if="openKey !== null" class="summary-backdrop" @tap="openKey = null"></view>
      </view>

      <!-- 矩阵：卡片高度固定；表头与姓名列用原生 sticky 固定，日期区横纵滚动 -->
      <view v-if="rows.length > 0" class="matrix-card" :style="{ height: matrixHeight + 'px' }">
        <view
          class="matrix"
          :class="{ 'is-lock-x': dragAxis === 'x', 'is-lock-y': dragAxis === 'y' }"
          @touchstart="onDragStart"
          @touchmove="onDragMove"
          @touchend="onDragEnd"
          @touchcancel="onDragEnd"
        >
          <view class="matrix-inner" :style="{ width: NAME_WIDTH + daysWidth + 'px' }">
            <!-- 表头 sticky top；姓名格 sticky left（横向滚动时列头不动） -->
            <view class="matrix-head">
              <view class="name-head" :style="{ width: NAME_WIDTH + 'px' }">
                <text class="name-head-text">{{ byName ? '班序' : '成员' }}</text>
              </view>

              <view class="day-head" :style="dayAreaStyle">
                <view
                  v-for="(day, dayIndex) in days"
                  :key="day.key"
                  class="matrix-day"
                  :class="{
                    'is-weekend': day.isWeekend,
                    'is-today': day.isToday,
                    'is-focused-column': focusDate === day.date,
                    'is-last': dayIndex === days.length - 1
                  }"
                  @tap="toggleColumnFocus(day.date)"
                >
                  <text class="matrix-day-num">{{ day.day }}</text>
                  <text class="matrix-day-week">{{ day.weekday }}</text>
                </view>
              </view>
            </view>

            <view v-for="(row, rowIndex) in rows" :key="row.id" class="matrix-row">
              <view
                class="name-row"
                :class="{
                  'is-focused': focusId === row.id,
                  'is-last': rowIndex === rows.length - 1
                }"
                :style="{ width: NAME_WIDTH + 'px' }"
                @tap="toggleFocus(row.id)"
              >
                <template v-if="byName">
                  <view class="name-line">
                    <text class="pattern is-row-mode">{{ row.patternText }}</text>
                    <text v-if="row.isSelf" class="badge-self">本人</text>
                  </view>
                </template>
                <template v-else>
                  <view class="name-line">
                    <text class="name">{{ row.name }}</text>
                    <text v-if="row.isSelf" class="badge-self">本人</text>
                  </view>
                  <text class="pattern">{{ row.patternText }}</text>
                </template>
              </view>

              <view
                class="day-row"
                :class="{
                  'is-focused': focusId === row.id,
                  'is-last': rowIndex === rows.length - 1
                }"
                :style="dayAreaStyle"
              >
                <view
                  v-for="(cell, cellIndex) in row.cells"
                  :key="cell.key"
                  class="matrix-cell"
                  :class="{
                    'is-last': cellIndex === row.cells.length - 1,
                    'is-column-focus': cell.date === focusDate
                  }"
                  @tap="openEditor(row.id, cell.date)"
                >
                  <view class="matrix-pill" :class="cell.tone ? 't-' + cell.tone : 'is-blank'">
                    {{ cell.text }}
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="empty">
        <text class="empty-title">还没有成员</text>
        <text class="empty-text">先在设置里加上成员和对应的班序，这里就会出现整月的排班。</text>
      </view>

      <!-- 图例：落在画布上，不另起卡片 -->
      <view class="legend">
        <view v-for="item in legends" :key="item.label" class="legend-item">
          <view class="legend-swatch" :class="'t-' + item.tone"></view>
          <text class="legend-text">{{ item.label }}</text>
        </view>
      </view>
    </view>
  </view>

  <tab-bar :current="1" />

  <day-editor
    v-if="editorTarget"
    :member-id="editorTarget.memberId"
    :date="editorTarget.date"
    mode="shift"
    @close="editorTarget = null"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onReady, onShareAppMessage } from '@dcloudio/uni-app'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import DayEditor from '../../components/day-editor.vue'
import { useCurrentShift, workdayKeyOf } from '../../composables/useCurrentShift'
import { rosterStore } from '../../store/roster'
import {
  getEffectiveShift,
  getOverrideMap,
  getSelf,
  isSelf,
  patternLabelOf,
  type Roster
} from '../../data/roster'
import { formatPeriodRange, getPeriod } from '../../data/period'
import { addDays, formatDateKey, isWeekend, parseDateKey, todayKey, weekdayLabel } from '../../data/dateUtils'
import { SHIFT_META, SHIFT_TYPES, type ShiftType } from '../../data/shifts'

/** 姓名列宽 / 日期列宽：与桌面 ≤639 档同一套（日期列 22 → 手机上加宽到 30，色块接近方格） */
const NAME_WIDTH = 88
const SHIFT_COL_WIDTH = 30
const NAME_COL_WIDTH = 48

const store = rosterStore
const roster = computed<Roster>(() => store.state.roster)

/** 转发统一用品牌封面，不用页面截图 */
onShareAppMessage(() => ({
  title: '昼夜 · 个人倒班记录本',
  path: '/pages/matrix/index',
  imageUrl: '/static/share-card.png'
}))

const period = computed(() => getPeriod(store.state.month))

/**
 * 概览条与图例的实际高度：矩阵高度要把它们和底栏之间的空间全部扣掉，
 * 才能保证图例始终落在底栏上方。二者高度由内容决定，挂载后量一次。
 */
const summaryHeight = ref(106)
const legendHeight = ref(18)
onReady(() => {
  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.select('.summary').boundingClientRect()
    query.select('.legend').boundingClientRect()
    query.exec(result => {
      const summary = result[0] as { height?: number } | null
      const legend = result[1] as { height?: number } | null
      if (summary?.height) summaryHeight.value = summary.height
      if (legend?.height) legendHeight.value = legend.height
    })
  })
})

/**
 * 「今天」按本人的班次算：夜班跨零点时，00:00–08:00 仍标在夜班开始那天，
 * 08:00 才切到新一天；概览条也按这一天统计。
 *
 * 只看最近两天（昨天 + 今天）的本人班次，找出正在进行的那个班次，
 * 它的开始日期就是工作日；没有进行中的班次才回落到日历今天。
 */
const today = todayKey()
const yesterday = formatDateKey(addDays(parseDateKey(today), -1))
const workdayDates = computed(() => [yesterday, today])
const workdayShifts = computed<ShiftType[]>(() => {
  const current = roster.value
  const self = getSelf(current)
  if (!self) return ['休息', '休息']
  const overrideMap = getOverrideMap(current)
  return [yesterday, today].map(date => (
    getEffectiveShift(current, self, date, overrideMap) ?? '休息'
  ))
})
const workdayMoment = useCurrentShift(workdayDates, workdayShifts)
const workday = computed(() => workdayKeyOf(workdayMoment.value, new Date()))

const mode = ref<'shift' | 'name'>('shift')
const byName = computed(() => mode.value === 'name')
/** 聚焦行：同一时间只高亮一行，再点同一个人取消 */
const focusId = ref<string | null>(null)
/** 聚焦列：点日期表头切换，再点同一天取消；与行聚焦可以同时存在 */
const focusDate = ref<string | null>(null)
const openKey = ref<string | null>(null)

// 翻月后日期集合变了，列聚焦的日期不一定还在，直接收掉
watch(period, value => {
  if (focusDate.value && !value.dates.includes(focusDate.value)) focusDate.value = null
})

/** 改班弹层：矩阵只改班次（加班在个人日历里录） */
const editorTarget = ref<{ memberId: string; date: string } | null>(null)

const subText = computed(() => (
  `${formatPeriodRange(period.value)} · 共 ${period.value.dates.length} 天 · ${roster.value.members.length} 位成员`
))

const inPeriod = computed(() => period.value.dates.includes(workday.value))

/* ------------------------------------------------------------ 概览条

白特并入白班、夜特并入夜班，事假不进概览条；
`special` 只用于名单里的「特」标记，不参与人数归类。 */

const SHIFT_GROUP: Partial<Record<ShiftType, { key: 'day' | 'night' | 'rest'; special: '白特' | '夜特' | null }>> = {
  白班: { key: 'day', special: null },
  白特: { key: 'day', special: '白特' },
  夜班: { key: 'night', special: null },
  夜特: { key: 'night', special: '夜特' },
  休息: { key: 'rest', special: null }
}

interface PersonEntry {
  id: string
  name: string
  position: string
  special: '白特' | '夜特' | null
}

const summaryGroups = computed(() => {
  const groups: Record<'day' | 'night' | 'rest', PersonEntry[]> = { day: [], night: [], rest: [] }
  if (!inPeriod.value) return groups

  const currentRoster = roster.value
  const overrideMap = getOverrideMap(currentRoster)
  currentRoster.members.forEach(member => {
    const shift = getEffectiveShift(currentRoster, member, workday.value, overrideMap)
    if (!shift) return
    const group = SHIFT_GROUP[shift]
    if (!group) return
    groups[group.key].push({
      id: member.id,
      name: member.name,
      position: member.position ?? '',
      special: group.special
    })
  })
  return groups
})

/** 名单最多占 38% 视口高（桌面 ≤639 的 38dvh） */
const popoverMax = Math.round(uni.getWindowInfo().windowHeight * 0.38)

const summaryCells = computed(() => {
  const groups = summaryGroups.value
  return [
    { key: 'day', label: '今日白班', value: inPeriod.value ? groups.day.length : null, people: groups.day },
    { key: 'night', label: '今日夜班', value: inPeriod.value ? groups.night.length : null, people: groups.night },
    { key: 'rest', label: '今日休息', value: inPeriod.value ? groups.rest.length : null, people: groups.rest }
  ].map(cell => ({
    ...cell,
    previewText: cell.people.slice(0, 3).map(person => person.name).join('、')
      + (cell.people.length > 3 ? '等' : ''),
    /** 名单滚动区：行少时按行高收口，超过 38vh 才滚动（对应桌面 `max-height: 38dvh`） */
    listHeight: Math.min(cell.people.length * 31, popoverMax)
  }))
})

function togglePopover(key: string) {
  openKey.value = openKey.value === key ? null : key
}

/* ------------------------------------------------------------ 矩阵 */

const days = computed(() => period.value.dates.map(date => ({
  key: date,
  date,
  day: date.slice(8, 10),
  weekday: weekdayLabel(date),
  isToday: date === workday.value,
  isWeekend: isWeekend(date)
})))

const rows = computed(() => {
  const currentRoster = roster.value
  const overrideMap = getOverrideMap(currentRoster)

  return currentRoster.members.map(member => {
    const pattern = patternLabelOf(currentRoster, member)
    const position = member.position ?? ''
    return {
      id: member.id,
      name: member.name,
      isSelf: isSelf(currentRoster, member.id),
      patternText: position ? `${pattern} · ${position}` : pattern,
      cells: period.value.dates.map(date => {
        const shift = getEffectiveShift(currentRoster, member, date, overrideMap)
        return {
          key: member.id + '|' + date,
          date,
          /** 按班次写单字、按姓名写人名；空档留破折号 */
          text: shift ? (byName.value ? member.name : SHIFT_META[shift].short) : '—',
          tone: shift ? SHIFT_META[shift].tone : ''
        }
      })
    }
  })
})

const columnWidth = computed(() => (byName.value ? NAME_COL_WIDTH : SHIFT_COL_WIDTH))
const daysWidth = computed(() => days.value.length * columnWidth.value)
/** 日期区（表头与每行）的宽度与列宽：必须显式给宽度，行才有和表头一样的横向尺寸 */
const dayAreaStyle = computed(() => ({
  width: `${daysWidth.value}px`,
  gridTemplateColumns: `repeat(${days.value.length}, minmax(${columnWidth.value}px, 1fr))`
}))

/* 与 base.scss 的 `.canvas` 内边距、子块间距保持一致：
 * 上 12 + 固定页头 56.4 + 下 12；summary / matrix / legend 之间各 12 */
const CANVAS_TOP = 80.4
const FLOW_GAP = 12
const CANVAS_BOTTOM = 12

/** 扣掉底栏、页头、概览条、图例与间距后，矩阵能占用的最大高度 */
const matrixAvailable = computed(() => {
  const available = uni.getWindowInfo().windowHeight
    - frame.navHeight
    - frame.tabBarHeight
    - CANVAS_TOP
    - summaryHeight.value
    - FLOW_GAP * 2
    - legendHeight.value
    - CANVAS_BOTTOM
  return Math.max(160, available - 2)
})

/**
 * 卡片高度固定为「图例上方剩余空间」：不随成员数伸缩，行多时在卡片内部纵向滚动。
 * 表头与姓名列的固定交给原生 sticky，不依赖 JS 滚动同步，滚动时不会抖。
 */
const matrixHeight = computed(() => matrixAvailable.value)

/**
 * 一次手势只允许滚一个方向：第一次明显位移时按主方向锁定另一轴。
 * 做法是给滚动容器加上 `is-lock-x / is-lock-y`，把另一轴的 overflow 关掉，
 * 原生滚动仍然由 WebView 处理，不需要 JS 逐帧跟手，因此不会抖。
 */
type DragAxis = 'x' | 'y' | null
const DRAG_LOCK_THRESHOLD = 8
const dragAxis = ref<DragAxis>(null)
let dragStartX = 0
let dragStartY = 0

function onDragStart(event: any) {
  const touch = event.touches?.[0]
  if (!touch) return
  dragStartX = touch.clientX
  dragStartY = touch.clientY
  dragAxis.value = null
}

function onDragMove(event: any) {
  if (dragAxis.value) return
  const touch = event.touches?.[0]
  if (!touch) return
  const dx = touch.clientX - dragStartX
  const dy = touch.clientY - dragStartY
  if (Math.abs(dx) < DRAG_LOCK_THRESHOLD && Math.abs(dy) < DRAG_LOCK_THRESHOLD) return
  dragAxis.value = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
}

function onDragEnd() {
  dragAxis.value = null
}

function toggleFocus(id: string) {
  focusId.value = focusId.value === id ? null : id
}

function toggleColumnFocus(date: string) {
  focusDate.value = focusDate.value === date ? null : date
}

/* ------------------------------------------------------------ 交互 */

function openEditor(memberId: string, date: string) {
  editorTarget.value = { memberId, date }
}

/** 图例：全称 + 12px 色块，和桌面矩阵同一套 */
const legends = SHIFT_TYPES.map(shift => ({
  label: SHIFT_META[shift].label,
  tone: SHIFT_META[shift].tone
}))
</script>

<style lang="scss" scoped>
@import './style.scss';
</style>
