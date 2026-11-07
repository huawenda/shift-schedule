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
  gap: 4px;
  padding-bottom: 4px;
  color: var(--muted);
  font-size: var(--fs-label);
  text-align: center;
}

.weekday {
  text-align: center;
}

/* 圆角格子：每格独立成块，缝隙直接露出画布色，不再用 1px 底色画网格线。
 * 与桌面 `.calendar-grid` 同一套：4px 缝、透明底、无外投影。 */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  overflow: visible;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

/* 今天格是「1px 边框 + 1px 外扩描边」，外面那 1px 会越出格子。
 * 最左/最右列压在页面的裁剪边，描边会被切掉一条。三行（星期栏 / 网格 / 图例）
 * 统一留 2px 横向余量，让描边落在裁剪线以内；三行余量相同，列宽仍一致，不会错位。 */
.calendar-weekdays,
.calendar-grid,
.calendar-legend {
  padding-left: 2px;
  padding-right: 2px;
}

/* 1px 细边 + 6px 圆角 + 白底，每格自成一张小卡。
 * 边线不能省：画布是浅灰，只靠白底浮起来时格与格之间只剩 4px 缝，边界会糊成一片。 */
.cal-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
}

/* 周期外：无边框 + 灰底，文字保持原对比度，靠「不是卡片」表达不属于本期 */
.cal-cell.is-outside {
  border-color: transparent;
  background: var(--surface-sunken);
}

.cal-cell.is-outside .cal-shift {
  opacity: 0.6;
}

/* 今天：1px 强调色边 + 1px 外扩描边（视觉 2px，但不吃内边距、不改变格子尺寸） */
.cal-cell.is-today {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.cal-day {
  display: block;
  align-self: flex-start;
  color: var(--text);
  font-size: var(--fs-small);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  /* 待办短横的位置永远预留，有/没有待办的两格高度一致 */
  padding-bottom: 2px;
  border-bottom: 2px solid transparent;
}

/* 有待办：日期数字下面压一道 2px 短横，宽度跟着数字本身走（与桌面同一套） */
.cal-day.is-todo {
  border-bottom-color: var(--todo-ink);
}

.cal-cell.is-today .cal-day {
  color: var(--text);
  font-weight: 600;
}

.cal-meta {
  display: block;
  overflow: hidden;
  color: var(--muted);
  font-size: var(--fs-micro);
  line-height: 1.3;
}

.cal-meta.is-festival {
  color: var(--warning-ink);
}

.cal-shift {
  margin-top: auto;
  padding: 2px 0;
  border-radius: var(--radius-sub);
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
