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
                :style="{ height: cell.listHeight + 'px' }"
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

      <!-- 矩阵：姓名列固定 + 日期区横向滚动 -->
      <view v-if="rows.length > 0" class="matrix-card">
        <view class="matrix">
          <view class="names" :style="{ width: NAME_WIDTH + 'px' }">
            <view class="name-head">
              <text class="name-head-text">{{ byName ? '班序' : '成员' }}</text>
            </view>

            <view
              v-for="(row, rowIndex) in rows"
              :key="row.id"
              class="name-row"
              :class="{
                'is-focused': focusId === row.id,
                'is-last': rowIndex === rows.length - 1
              }"
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
          </view>

          <view class="days-wrap">
            <scroll-view
              scroll-x
              :show-scrollbar="false"
              class="days"
              @scroll="onScroll"
            >
              <view class="days-inner" :style="{ width: daysWidth + 'px' }">
                <view class="day-head" :style="gridStyle">
                  <view
                    v-for="(day, dayIndex) in days"
                    :key="day.key"
                    class="matrix-day"
                    :class="{
                      'is-weekend': day.isWeekend,
                      'is-today': day.isToday,
                      'is-last': dayIndex === days.length - 1
                    }"
                  >
                    <text class="matrix-day-num">{{ day.day }}</text>
                    <text class="matrix-day-week">{{ day.weekday }}</text>
                  </view>
                </view>

                <view
                  v-for="(row, rowIndex) in rows"
                  :key="row.id"
                  class="day-row"
                  :class="{
                    'is-focused': focusId === row.id,
                    'is-last': rowIndex === rows.length - 1
                  }"
                  :style="gridStyle"
                >
                  <view
                    v-for="(cell, cellIndex) in row.cells"
                    :key="cell.key"
                    class="matrix-cell"
                    :class="{ 'is-last': cellIndex === row.cells.length - 1 }"
                    @tap="openEditor(row.id, cell.date)"
                  >
                    <view class="matrix-pill" :class="cell.tone ? 't-' + cell.tone : 'is-blank'">
                      {{ cell.text }}
                    </view>
                  </view>
                </view>
              </view>
            </scroll-view>

            <view class="matrix-edge" :class="{ 'is-hidden': !edgeVisible }"></view>
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
        <text class="legend-hint">左右滑动查看整月</text>
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
import { computed, ref } from 'vue'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import DayEditor from '../../components/day-editor.vue'
import { rosterStore } from '../../store/roster'
import {
  getEffectiveShift,
  getOverrideMap,
  isSelf,
  patternLabelOf,
  type Roster
} from '../../data/roster'
import { formatPeriodRange, getPeriod } from '../../data/period'
import { isWeekend, todayKey, weekdayLabel } from '../../data/dateUtils'
import { SHIFT_META, SHIFT_TYPES, type ShiftType } from '../../data/shifts'

/** 姓名列宽 / 日期列宽：与桌面 ≤639 档同一套（日期列 22 → 手机上加宽到 30，色块接近方格） */
const NAME_WIDTH = 88
const SHIFT_COL_WIDTH = 30
const NAME_COL_WIDTH = 48

const store = rosterStore
const roster = computed<Roster>(() => store.state.roster)
const period = computed(() => getPeriod(store.state.month))
const today = todayKey()

const mode = ref<'shift' | 'name'>('shift')
const byName = computed(() => mode.value === 'name')
const focusId = ref<string | null>(null)
const openKey = ref<string | null>(null)

/** 改班弹层：矩阵只改班次（加班在个人日历里录） */
const editorTarget = ref<{ memberId: string; date: string } | null>(null)

const subText = computed(() => (
  `${formatPeriodRange(period.value)} · 共 ${period.value.dates.length} 天 · ${roster.value.members.length} 位成员`
))

const inPeriod = computed(() => period.value.dates.includes(today))

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
    const shift = getEffectiveShift(currentRoster, member, today, overrideMap)
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
  isToday: date === today,
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
const gridStyle = computed(() => (
  `grid-template-columns: repeat(${days.value.length}, minmax(${columnWidth.value}px, 1fr))`
))
const daysWidth = computed(() => days.value.length * columnWidth.value)

/* 横向滚动条被藏了，右缘用一层渐隐提示「还有半个月」；滚到头就收掉 */
const scrollLeft = ref(0)
const edgeVisible = ref(true)
const visibleWidth = computed(() => (
  Math.max(0, uni.getWindowInfo().windowWidth - 24 - NAME_WIDTH)
))

function onScroll(event: { detail: { scrollLeft: number } }) {
  scrollLeft.value = event.detail.scrollLeft
  edgeVisible.value = scrollLeft.value < daysWidth.value - visibleWidth.value - 1
}

function toggleFocus(id: string) {
  focusId.value = focusId.value === id ? null : id
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
