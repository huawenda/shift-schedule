<template>
  <view class="calendar">
    <view class="calendar-weekdays">
      <text v-for="label in weekdays" :key="label" class="weekday">{{ label }}</text>
    </view>

    <view class="calendar-grid">
      <view
        v-for="cell in cells"
        :key="cell.key"
        class="cal-cell"
        :class="{ 'is-outside': !cell.inPeriod, 'is-today': cell.isToday }"
        @tap="onTap(cell)"
      >
        <text class="cal-day" :class="{ 'is-todo': cell.todoCount > 0 }">{{ cell.day }}</text>
        <text class="cal-meta" :class="{ 'is-festival': cell.isFestival }">{{ cell.meta }}</text>
        <text v-if="cell.otText" class="cal-ot">+{{ cell.otText }}</text>
        <text v-else-if="cell.leaveText" class="cal-leave">{{ cell.leaveText }}</text>
        <text
          class="cal-shift"
          :class="['t-' + cell.tone, cell.changed ? 'is-changed' : '']"
        >{{ cell.shiftLabel }}</text>
        <view v-if="cell.legal" class="cal-legal">法</view>
      </view>
    </view>

    <view class="calendar-legend">
      <text class="cal-ot legend-chip">+2h</text>
      <text class="legend-text">加班数</text>
      <text class="cal-legal legend-chip">法</text>
      <text class="legend-text">法定节假日</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ShiftType } from '../data/shifts'

interface CalendarCellView {
  key: string
  date: string
  day: string
  inPeriod: boolean
  isToday: boolean
  meta: string
  isFestival: boolean
  shift: ShiftType
  shiftLabel: string
  tone: string
  changed: boolean
  otText: string
  legal: boolean
  leaveText: string
  todoCount: number
}

defineProps<{ cells: CalendarCellView[] }>()
const emit = defineEmits<{ (event: 'edit', date: string): void }>()

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

function onTap(cell: CalendarCellView) {
  if (cell.inPeriod) emit('edit', cell.date)
}
</script>

<style lang="scss" scoped>
/* 与桌面 `schedule.scss` 的日历 + `≤639` 档 1:1 */
.calendar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--fs-label);
  text-align: center;
}

.weekday {
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border-radius: var(--radius-panel);
  background: var(--rule);
  box-shadow: var(--shadow-raised);
}

.cal-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 5px;
  background: var(--surface);
}

.cal-cell.is-outside {
  background: var(--surface-sunken);
}

/* WXSS 不支持通配选择器（`> *` 会编译失败），逐个子元素降透明度 */
.cal-cell.is-outside .cal-day,
.cal-cell.is-outside .cal-meta,
.cal-cell.is-outside .cal-ot,
.cal-cell.is-outside .cal-leave,
.cal-cell.is-outside .cal-shift,
.cal-cell.is-outside .cal-legal {
  opacity: 0.45;
}

.cal-cell.is-today {
  background: var(--accent-weak);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.cal-day {
  position: relative;
  display: block;
  align-self: flex-start;
  color: var(--muted);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

/* 待办：日期左侧 3×12 竖条，画在格子的 5px 内边距里 */
.cal-day.is-todo::before {
  position: absolute;
  top: 50%;
  left: -4px;
  width: 3px;
  height: 12px;
  transform: translateY(-50%);
  border-radius: 2px;
  background: var(--todo-ink);
  content: "";
}

.cal-cell.is-today .cal-day {
  color: var(--text);
  font-weight: 600;
}

.cal-meta {
  display: block;
  overflow: hidden;
  color: var(--faint);
  font-size: var(--fs-micro);
  line-height: 1.3;
}

.cal-meta.is-festival {
  color: var(--warning-ink);
}

.cal-shift {
  margin-top: auto;
  padding: 2px 0;
  border-radius: var(--radius-mark);
  font-size: var(--fs-label);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}

/* 描边只表示「与默认班次不同」；inset 不占高度 */
.cal-shift.is-changed {
  box-shadow: inset 0 0 0 1px var(--shift-mark);
}

.cal-shift.t-night.is-changed {
  box-shadow: inset 0 0 0 1px var(--shift-mark-inverse);
}

.cal-ot,
.cal-leave {
  align-self: flex-start;
  height: 14px;
  padding: 0 3px;
  border-radius: var(--radius-mark);
  font-size: var(--fs-micro);
  line-height: 14px;
  white-space: nowrap;
}

.cal-ot {
  background: var(--overtime-bg);
  color: var(--overtime-ink);
  font-weight: 700;
}

.cal-leave {
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--border);
  color: var(--muted);
  font-weight: 600;
}

/* 法定挂右上角：只占 13px，日期在左，横向不会撞 */
.cal-legal {
  position: absolute;
  top: 4px;
  right: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: var(--radius-mark);
  background: var(--warning-bg);
  box-shadow: inset 0 0 0 1px var(--warning-border);
  color: var(--warning-ink);
  font-size: var(--fs-micro);
  font-weight: 600;
  line-height: 1;
}

/* 图例里两个标记退回普通流 */
.legend-chip {
  position: static;
  align-self: auto;
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1) var(--sp-2);
  font-size: var(--fs-label);
  color: var(--muted);
}

.legend-text {
  margin-right: var(--sp-2);
}
</style>
