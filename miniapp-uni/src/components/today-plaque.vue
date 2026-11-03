<template>
  <view class="plaque">
    <view class="plaque-top">
      <!-- 现在 / 下一班 -->
      <view class="plaque-cell">
        <text class="plaque-label">{{ shiftLabel }}</text>
        <text
          v-if="todayInPeriod && moment.kind !== 'idle'"
          class="plaque-shift"
          hover-class="is-pressed"
          @tap="$emit('edit', moment.dateKey)"
        >{{ shiftName }}</text>
        <text v-else class="plaque-shift is-static">{{ shiftName }}</text>
        <text class="plaque-range">{{ rangeText }}</text>
      </view>

      <!-- 倒计时 -->
      <view class="plaque-cell">
        <text class="plaque-label">{{ todayInPeriod ? moment.countdownLabel : '今天' }}</text>
        <view v-if="todayInPeriod && moment.countdown" class="plaque-cd">
          <text class="cd-num">{{ moment.countdown.value }}</text>
          <text class="cd-unit">{{ moment.countdown.unit }}</text>
          <template v-if="moment.countdownTail">
            <text class="cd-num">{{ moment.countdownTail.value }}</text>
            <text class="cd-unit">{{ moment.countdownTail.unit }}</text>
          </template>
        </view>
        <text v-else class="plaque-cd is-text">{{ todayInPeriod ? '—' : '不在本期' }}</text>
        <view class="plaque-progress">
          <view class="plaque-progress-bar" :style="{ width: progress }"></view>
          <view class="plaque-progress-tick" :style="{ left: progress }"></view>
        </view>
      </view>

      <!-- 本月统计（手机上通栏） -->
      <view class="plaque-cell">
        <text class="plaque-label">本月</text>
        <view class="plaque-tally">
          <view v-for="item in tallyItems" :key="item.key" class="tally-item">
            <view class="tally-dot" :class="'is-' + item.tone"></view>
            <text class="tally-num">{{ summary[item.key] }}</text>
            <text class="tally-label">{{ item.label }}</text>
          </view>
        </view>
        <text class="plaque-today">{{ todayLine }}</text>
      </view>
    </view>

    <!-- 整期节奏条 -->
    <view class="plaque-rhythm-wrap">
      <view class="plaque-rhythm-head">
        <text>{{ personName }} {{ personGroup }}</text>
        <text>{{ firstLabel }} → {{ lastLabel }}</text>
      </view>
      <view class="plaque-rhythm">
        <template v-for="(run, runIndex) in rhythmRuns" :key="run.key + runIndex">
          <view v-if="runIndex > 0" class="plaque-rhythm-gap"></view>
          <view
            v-for="item in run.items"
            :key="item.date"
            class="rhythm-bar"
            :class="['is-' + toneOf(item.shift), item.date === today ? 'is-today' : '']"
          ></view>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { SHIFT_META, type ShiftType } from '../data/shifts'
import type { ShiftDayCounts } from '../data/stats'
import type { ShiftMoment } from '../composables/useCurrentShift'

type TallyKey = 'day' | 'night' | 'rest' | 'daySpecial' | 'nightSpecial' | 'leave'

const TALLY: Array<{ key: TallyKey; label: string; tone: string }> = [
  { key: 'day', label: '白班', tone: 'day' },
  { key: 'night', label: '夜班', tone: 'night' },
  { key: 'rest', label: '休', tone: 'rest' },
  { key: 'daySpecial', label: '白特', tone: 'dayx' },
  { key: 'nightSpecial', label: '夜特', tone: 'nightx' },
  { key: 'leave', label: '事假', tone: 'leave' }
]

const props = defineProps<{
  dates: string[]
  defaultShifts: ShiftType[]
  shifts: ShiftType[]
  summary: ShiftDayCounts
  moment: ShiftMoment
  today: string
  todayMeta: string
  todayTodoCount: number
  personName: string
  personGroup: string
  todayInPeriod: boolean
}>()

defineEmits<{ (event: 'edit', date: string): void }>()

const tallyItems = computed(() => TALLY.filter(item => props.summary[item.key] > 0))
const progress = computed(() => `${Math.round(props.moment.progress * 100)}%`)
const firstLabel = computed(() => formatMonthDay(props.dates[0]))
const lastLabel = computed(() => formatMonthDay(props.dates[props.dates.length - 1]))

const shiftLabel = computed(() => {
  if (!props.todayInPeriod) return '本期'
  if (props.moment.kind === 'active') return '现在'
  if (props.moment.kind === 'idle') return '本月'
  return '下一班'
})

const shiftName = computed(() => (
  !props.todayInPeriod || props.moment.kind === 'idle' ? '—' : props.moment.shift
))

const rangeText = computed(() => (
  props.todayInPeriod ? props.moment.rangeText : `本期 ${props.dates.length} 天 · 今天不在本期`
))

const todayLine = computed(() => [
  `今天 ${formatMonthDay(props.today)} 周${weekdayLabel(props.today)}`,
  props.todayMeta,
  props.todayTodoCount > 0 ? `待办 ${props.todayTodoCount} 项` : ''
].filter(Boolean).join(' · '))

/** 节奏条按默认班次切成连续组：同组内 2px，组间 8px */
const rhythmRuns = computed(() => {
  const runs: Array<{ key: ShiftType; items: Array<{ date: string; shift: ShiftType }> }> = []
  props.dates.forEach((date, index) => {
    const base = props.defaultShifts[index] ?? '休息'
    const shift = props.shifts[index] ?? '休息'
    const last = runs[runs.length - 1]
    if (last && last.key === base) last.items.push({ date, shift })
    else runs.push({ key: base, items: [{ date, shift }] })
  })
  return runs
})

function toneOf(shift: ShiftType) {
  return SHIFT_META[shift].tone
}
</script>

<style lang="scss" scoped>
/* 与桌面 `stats.scss` 的值班牌 + `≤639` 档 1:1 */
.plaque {
  overflow: hidden;
  border-radius: var(--radius-panel);
  background: var(--chrome);
  color: var(--chrome-text);
  box-shadow: var(--shadow-raised);
}

.plaque-top {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.plaque-cell {
  min-width: 0;
  padding: 12px var(--sp-3) 10px;
}

.plaque-cell + .plaque-cell {
  border-left: 1px solid var(--chrome-line);
}

.plaque-cell:nth-child(3) {
  grid-column: 1 / -1;
  border-top: 1px solid var(--chrome-line);
  border-left: 0;
}

.plaque-label {
  display: block;
  color: var(--chrome-muted);
  font-size: var(--fs-label);
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 14px;
}

.plaque-shift {
  display: block;
  max-width: 100%;
  margin-top: 4px;
  overflow: hidden;
  color: var(--chrome-text);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plaque-shift.is-pressed {
  color: var(--chrome-accent);
}

.plaque-shift.is-static {
  cursor: default;
}

.plaque-range {
  display: block;
  margin-top: 6px;
  overflow: hidden;
  color: var(--chrome-muted);
  font-size: var(--fs-small);
  letter-spacing: 0.02em;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plaque-cd {
  display: flex;
  align-items: baseline;
  margin-top: 4px;
  color: var(--chrome-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.plaque-cd.is-text {
  display: block;
  font-size: 22px;
  letter-spacing: 0;
}

.cd-num {
  font-size: 28px;
  font-weight: 700;
}

.cd-unit {
  margin: 0 4px 0 2px;
  color: var(--chrome-muted);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.plaque-progress {
  position: relative;
  height: 2px;
  margin-top: 10px;
  background: var(--chrome-line);
}

.plaque-progress-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--chrome-accent);
}

.plaque-progress-tick {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 8px;
  background: var(--chrome-accent);
}

.plaque-tally {
  display: flex;
  flex-wrap: wrap;
  gap: 6px var(--sp-3);
  margin-top: 8px;
}

.tally-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

.tally-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.tally-num {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.tally-label {
  color: var(--chrome-muted);
  font-size: var(--fs-label);
  letter-spacing: 0.06em;
}

.plaque-today {
  display: block;
  margin-top: 8px;
  color: var(--chrome-muted);
  font-size: var(--fs-small);
  line-height: 16px;
}

.plaque-rhythm-wrap {
  padding: var(--sp-2) var(--sp-3) 10px;
  border-top: 1px solid var(--chrome-line);
}

.plaque-rhythm-head {
  display: flex;
  justify-content: space-between;
  padding-bottom: 4px;
  color: var(--chrome-muted);
  font-size: var(--fs-micro);
  letter-spacing: 0.12em;
  line-height: 12px;
  font-variant-numeric: tabular-nums;
}

.plaque-rhythm {
  display: flex;
  gap: 2px;
}

.rhythm-bar {
  display: block;
  flex: 1 1 0;
  min-width: 0;
  height: 16px;
  border-radius: 2px;
}

.plaque-rhythm-gap {
  flex: 0 0 var(--sp-1);
}

.rhythm-bar.is-today {
  box-shadow: inset 0 0 0 1px var(--chrome-text);
}

/* 深底班次色：与桌面同一组令牌 */
.tally-dot.is-day,
.rhythm-bar.is-day {
  background: var(--shift-day-on-dark);
}

.tally-dot.is-night,
.rhythm-bar.is-night {
  background: var(--shift-night-on-dark);
}

.tally-dot.is-rest,
.rhythm-bar.is-rest {
  background: var(--shift-rest-on-dark);
}

.tally-dot.is-dayx,
.rhythm-bar.is-dayx {
  background: var(--shift-dayx-on-dark);
}

.tally-dot.is-nightx,
.rhythm-bar.is-nightx {
  background: var(--shift-nightx-on-dark);
}

.tally-dot.is-leave,
.rhythm-bar.is-leave {
  background: var(--shift-leave-on-dark);
}
</style>
