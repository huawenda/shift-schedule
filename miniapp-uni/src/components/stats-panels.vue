<template>
  <view class="stats-grid">
    <!-- 1 本月概览 -->
    <view class="stat-card">
      <view class="stat-head">
        <text class="stat-title">本月概览</text>
        <text class="stat-note">共 {{ totalDays }} 天</text>
      </view>

      <view class="day-counts">
        <view v-for="card in cards" :key="card.key" class="day-count" :class="'is-' + card.key">
          <text class="day-count-num">{{ formatDays(card.days) }}</text>
          <text class="day-count-label">{{ card.label }}</text>
          <text v-if="card.hours > 0" class="day-count-extra" :class="{ 'is-leave': card.muted }">
            {{ formatOvertimeHours(card.hours) }}
          </text>
        </view>
      </view>

      <text class="stat-foot">
        出勤 <text class="strong">{{ formatDays(days.work) }}</text> 天<text
          v-if="leave.days > 0"
        > · 事假 <text class="strong">{{ formatDays(leave.days) }}</text> 天</text>
      </text>
    </view>

    <!-- 2 加班分布 -->
    <view class="stat-card stat-card-ot">
      <view class="stat-head">
        <text class="stat-title">加班分布</text>
        <text class="stat-note"></text>
      </view>

      <view v-if="overtime.total > 0" class="ot-chart">
        <view class="ot-plot-row">
          <view v-for="column in otColumns" :key="column.group" class="ot-col">
            <view class="ot-col-plot">
              <view class="ot-bar-wrap">
                <text
                  class="ot-col-value"
                  :class="'is-' + column.tone"
                  :style="{ bottom: `calc(${column.ratio}% + 3px)` }"
                >{{ formatOvertimeHours(column.hours) }}</text>
                <view
                  class="ot-bar"
                  :class="'is-' + column.tone"
                  :style="{ height: column.ratio + '%' }"
                ></view>
              </view>
            </view>
          </view>
        </view>
        <view class="ot-axis-row">
          <text v-for="column in otColumns" :key="column.group" class="ot-col-label">
            {{ column.label }}
          </text>
        </view>
      </view>
      <text v-else class="stat-empty">这个月还没有加班记录。</text>
    </view>

    <!-- 3 薪资计算 -->
    <view class="stat-card">
      <view class="stat-head">
        <text class="stat-title">薪资计算</text>
        <text class="stat-note">时薪 {{ formatMoney(salary.hourlyWage) }}</text>
      </view>

      <template v-if="salary.hasBase">
        <view class="money-list">
          <view class="money-group">
            <text>基本项</text>
            <text>{{ formatMoney(salary.fixedTotal) }}</text>
          </view>
          <view class="money-row is-sub"><text>基本工资</text><text>{{ formatMoney(salary.base) }}</text></view>
          <view class="money-row is-sub"><text>绩效津贴</text><text>{{ formatMoney(salary.performance) }}</text></view>
          <view class="money-row is-sub"><text>岗位津贴</text><text>{{ formatMoney(salary.position) }}</text></view>

          <view class="money-group">
            <text>加班工资</text>
            <text>{{ formatMoney(salary.overtimePay + salary.nightAllowance) }}</text>
          </view>
          <view v-for="kind in overtimeKinds" :key="kind" class="money-row is-sub">
            <text>{{ OVERTIME_KIND_LABEL[kind] }}<text class="money-rate">×{{ OVERTIME_RATES[kind] }}</text></text>
            <text>{{ formatMoney(salary[OVERTIME_PAY_FIELD[kind]]) }}</text>
          </view>
          <view class="money-row is-sub">
            <text>夜班津贴（{{ salary.nightDays }} 天）</text>
            <text>{{ formatMoney(salary.nightAllowance) }}</text>
          </view>

          <view class="money-group">
            <text>扣款项</text>
            <text>{{ formatMoney(salary.socialFund + salary.leaveDeduction) }}</text>
          </view>
          <view class="money-row is-sub is-deduct">
            <text>社保公积金</text>
            <text>{{ formatMoney(salary.socialFund) }}</text>
          </view>
          <view v-if="salary.leaveHours > 0" class="money-row is-sub is-deduct">
            <text>事假扣款（{{ formatOvertimeHours(salary.leaveHours) }}）</text>
            <text>{{ formatMoney(salary.leaveDeduction) }}</text>
          </view>

          <view class="money-summary">
            <view class="money-summary-item">
              <text class="money-summary-label">应发</text>
              <text class="money-summary-value">{{ formatMoney(salary.gross) }}</text>
            </view>
            <view class="money-summary-item is-total">
              <text class="money-summary-label">实发</text>
              <text class="money-summary-value">{{ formatMoney(salary.net) }}</text>
            </view>
          </view>
        </view>
      </template>

      <view v-else class="stat-empty-block">
        <text class="stat-empty">还没填基本工资，算不出加班费与实发。</text>
        <view class="btn btn-quiet" @tap="$emit('open-profile')">去「个人资料」填</view>
      </view>
    </view>

    <!-- 4 每日明细 -->
    <view class="stat-card stat-card-detail">
      <view class="stat-head">
        <text class="stat-title">每日明细</text>
        <text class="stat-note"></text>
      </view>

      <template v-if="overtimeDays.length > 0">
        <view class="detail-head">
          <text>日期</text>
          <text>班次</text>
          <text>加班</text>
          <text>加班费</text>
        </view>
        <scroll-view scroll-y class="detail-scroll" :style="{ height: detailHeight + 'px' }">
          <view v-for="day in overtimeDays" :key="day.date" class="detail-row">
            <view class="detail-cell">
              <text>{{ formatMonthDay(day.date) }}</text>
              <text class="detail-week">周{{ weekdayLabel(day.date) }}</text>
            </view>
            <view class="detail-cell">
              <view class="detail-shift-wrap">
                <text class="detail-shift" :class="'t-' + SHIFT_META[day.shift].tone">
                  {{ SHIFT_META[day.shift].label }}
                </text>
                <text v-if="day.isLegal" class="detail-legal">法</text>
              </view>
            </view>
            <view class="detail-cell detail-num">{{ formatOvertimeHours(day.hours) }}</view>
            <view class="detail-cell detail-num">
              <text v-if="salary.hasBase" class="pay-pill" :class="'is-t' + payTier(day.pay, maxPay, minPay)">
                {{ formatMoney(day.pay) }}
              </text>
              <text v-else>—</text>
            </view>
          </view>
        </scroll-view>
      </template>
      <text v-else class="stat-empty">这个月还没有加班记录。</text>

      <text v-if="overtimeDays.length > 0" class="stat-foot">
        合计 <text class="strong">{{ formatOvertimeHours(overtime.total) }}</text><text
          v-if="salary.hasBase"
        > · 加班费 <text class="strong">{{ formatMoney(salary.overtimePay) }}</text></text>
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '../data/profile'
import { formatOvertimeHours } from '../data/overtime'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { SHIFT_META, type ShiftType } from '../data/shifts'
import {
  OVERTIME_KIND_LABEL,
  OVERTIME_PAY_FIELD,
  OVERTIME_RATES,
  payTier,
  type MonthStats,
  type OvertimeKind
} from '../data/stats'

const props = defineProps<{ stats: MonthStats; totalDays: number }>()
defineEmits<{ (event: 'open-profile'): void }>()

const OVERTIME_KINDS: OvertimeKind[] = ['weekday', 'special', 'legal']

/** 五根柱：白班 / 夜班 / 白特 / 夜特 / 法定；法定有值才出现 */
const OVERTIME_COLUMNS = [
  { group: '白班', label: '白班加班', tone: 'day' },
  { group: '夜班', label: '夜班加班', tone: 'night' },
  { group: '白特', label: '白特加班', tone: 'dayx' },
  { group: '夜特', label: '夜特加班', tone: 'nightx' },
  { group: '法定', label: '法定加班', tone: 'legal' }
] as const

const days = computed(() => props.stats.days)
const leave = computed(() => props.stats.leave)
const overtime = computed(() => props.stats.overtime)
const salary = computed(() => props.stats.salary)
const overtimeDays = computed(() => props.stats.overtimeDays)

const overtimeKinds = OVERTIME_KINDS
const formatDays = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/** 六张卡片：白 / 夜 / 休 / 特勤 / 事假 / 法定 */
const cards = computed(() => {
  const counts = props.stats.days
  const groups = props.stats.overtimeByGroup
  return [
    { key: 'day', label: '白班', days: counts.day, hours: groups.白班, muted: false },
    { key: 'night', label: '夜班', days: counts.night, hours: groups.夜班, muted: false },
    { key: 'rest', label: '休息', days: counts.rest, hours: 0, muted: false },
    {
      key: 'special',
      label: '特勤',
      days: counts.daySpecial + counts.nightSpecial,
      hours: groups.白特 + groups.夜特,
      muted: false
    },
    { key: 'leave', label: '事假', days: props.stats.leave.days, hours: props.stats.leave.hours, muted: true },
    { key: 'legal', label: '法定', days: counts.legal, hours: groups.法定, muted: false }
  ]
})

const otColumns = computed(() => {
  const groups = props.stats.overtimeByGroup
  const columns = OVERTIME_COLUMNS
    .map(column => ({
      ...column,
      hours: groups[column.group],
      ratio: 0
    }))
    .filter(column => column.group !== '法定' || column.hours > 0)
  const max = columns.reduce((value, column) => Math.max(value, column.hours), 0)
  columns.forEach(column => {
    column.ratio = max > 0 ? (column.hours / max) * 100 : 0
  })
  return columns
})

const minPay = computed(() => (props.stats.overtimeDays.length > 0
  ? Math.min(...props.stats.overtimeDays.map(day => day.pay))
  : 0))
const maxPay = computed(() => (props.stats.overtimeDays.length > 0
  ? Math.max(...props.stats.overtimeDays.map(day => day.pay))
  : 0))

/** 明细滚动区高度：最多 280px，行少时按实际行高收口 */
const detailHeight = computed(() => Math.min(280, Math.max(0, props.stats.overtimeDays.length * 32)))
</script>

<style lang="scss" scoped>
/* 与桌面 `stats.scss` 的单列移动档 1:1 */
.stats-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  width: 100%;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-panel);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}

.stat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--rule);
}

.stat-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.stat-note {
  color: var(--muted);
  font-size: var(--fs-label);
  white-space: nowrap;
}

.stat-card:first-child .stat-title::before {
  display: inline-block;
  width: 3px;
  height: 12px;
  margin-right: 7px;
  border-radius: 2px;
  background: var(--accent);
  content: "";
  vertical-align: -1px;
}

.stat-foot {
  display: block;
  margin-top: auto;
  padding-top: var(--sp-2);
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: var(--fs-control);
  font-variant-numeric: tabular-nums;
}

.strong {
  color: var(--text);
  font-weight: 600;
}

.stat-empty {
  display: block;
  padding: 4px 0;
  color: var(--muted);
  font-size: var(--fs-small);
}

.stat-empty-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
}

/* ------------------------------------------------------------ 本月概览 */

.day-counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.day-count {
  display: flex;
  align-items: baseline;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-card);
  background: var(--surface-sunken);
  color: var(--muted);
}

.day-count.is-day { background: var(--shift-day-bg); color: var(--shift-day-ink); }
.day-count.is-night { background: var(--shift-night-bg); color: var(--shift-night-ink); }
.day-count.is-rest { background: var(--shift-rest-bg); color: var(--shift-rest-ink); }
.day-count.is-special { background: var(--shift-dayx-bg); color: var(--shift-dayx-ink); }
.day-count.is-leave { background: var(--shift-leave-bg); color: var(--shift-leave-ink); }
.day-count.is-legal { background: var(--warning-border); color: var(--warning-ink); }

.day-count-num {
  font-size: var(--fs-subhead);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.day-count-label {
  color: inherit;
  font-size: var(--fs-label);
  opacity: 0.72;
}

.day-count-extra {
  margin-left: auto;
  padding: 0 5px;
  border-radius: var(--radius-mark);
  background: var(--overtime-bg);
  color: var(--overtime-ink);
  font-size: var(--fs-label);
  font-weight: 600;
  line-height: 17px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.day-count-extra.is-leave {
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--border);
  color: var(--muted);
  font-weight: 500;
}

/* ------------------------------------------------------------ 加班分布 */

.ot-chart {
  display: flex;
  flex-direction: column;
  height: 190px;
}

.ot-plot-row {
  display: flex;
  flex: 1 1 auto;
  align-items: flex-end;
  gap: var(--sp-3);
  min-height: 0;
  border-bottom: 1px solid var(--border);
}

.ot-axis-row {
  display: flex;
  gap: var(--sp-3);
  padding-top: 5px;
}

.ot-col {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  height: 100%;
}

.ot-col-plot {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  min-height: 0;
  padding-top: 17px;
}

.ot-bar-wrap {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  min-height: 0;
}

.ot-col-value {
  position: absolute;
  right: 0;
  left: 0;
  color: var(--muted);
  font-size: var(--fs-label);
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ot-col-value.is-day { color: var(--shift-day-ink); }
.ot-col-value.is-night { color: var(--shift-night-bg); }
.ot-col-value.is-dayx { color: var(--shift-dayx-ink); }
.ot-col-value.is-nightx { color: var(--shift-nightx-ink); }
.ot-col-value.is-legal { color: var(--warning-ink); }

.ot-bar {
  width: 100%;
  max-width: 64px;
  min-height: 2px;
  border-radius: var(--radius-mark) var(--radius-mark) 0 0;
}

.ot-bar.is-day { background: var(--shift-day-bg); }
.ot-bar.is-night { background: var(--shift-night-bg); }
.ot-bar.is-dayx { background: var(--shift-dayx-bg); }
.ot-bar.is-nightx { background: var(--shift-nightx-bg); }
.ot-bar.is-legal { background: var(--warning-border); }

.ot-col-label {
  flex: 1 1 0;
  min-width: 0;
  color: var(--muted);
  font-size: var(--fs-label);
  text-align: center;
  white-space: nowrap;
}

/* ------------------------------------------------------------ 薪资 */

.money-list {
  display: flex;
  flex-direction: column;
}

.money-row,
.money-group {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  column-gap: var(--sp-2);
  color: var(--muted);
  font-size: var(--fs-control);
  font-variant-numeric: tabular-nums;
}

.money-row {
  padding: 5px 0;
}

.money-row > text:last-child,
.money-group > text:last-child {
  text-align: right;
}

.money-row.is-deduct > text:last-child {
  color: var(--danger);
}

.money-group {
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--rule);
  color: var(--text);
  font-weight: 600;
}

.money-group:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.money-group > text:first-child::before {
  display: inline-block;
  width: 2px;
  height: 10px;
  margin-right: 6px;
  border-radius: 1px;
  background: var(--control);
  content: "";
  vertical-align: -1px;
}

.money-row.is-sub {
  padding-left: var(--sp-4);
}

.money-rate {
  margin-left: 6px;
  padding: 0 4px;
  border-radius: var(--radius-mark);
  background: var(--raised);
  color: var(--muted);
  font-size: var(--fs-label);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.money-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border-strong);
}

.money-summary-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--radius-control);
  background: var(--surface-sunken);
}

.money-summary-item.is-total {
  background: var(--accent-weak);
}

.money-summary-label {
  color: var(--muted);
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 16px;
}

.money-summary-value {
  color: var(--text);
  font-size: var(--fs-metric-sm);
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

/* ------------------------------------------------------------ 每日明细 */

.detail-head {
  display: grid;
  grid-template-columns: 22% 30% 20% 28%;
  padding: 7px 0 6px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-tint);
  color: var(--muted);
  font-size: var(--fs-small);
  font-weight: 500;
  text-align: center;
}

.detail-head > text {
  text-align: center;
}

.detail-scroll {
  width: 100%;
}

.detail-row {
  display: grid;
  grid-template-columns: 22% 30% 20% 28%;
  border-bottom: 1px solid var(--rule);
  font-size: var(--fs-control);
  text-align: center;
}

.detail-row:last-child {
  border-bottom: 0;
}

.detail-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  min-width: 0;
  text-align: center;
}

.detail-week {
  margin-left: 4px;
  color: var(--faint);
  font-size: var(--fs-label);
}

.detail-num {
  font-variant-numeric: tabular-nums;
}

.detail-shift-wrap {
  position: relative;
  display: inline-flex;
}

.detail-shift {
  padding: 1px 6px;
  border-radius: var(--radius-mark);
  font-size: var(--fs-label);
}

.detail-legal {
  position: absolute;
  top: 50%;
  left: calc(100% + 3px);
  transform: translateY(-50%);
  padding: 0 4px;
  border-radius: var(--radius-mark);
  background: var(--warning-bg);
  box-shadow: inset 0 0 0 1px var(--warning-border);
  color: var(--warning-ink);
  font-size: var(--fs-micro);
  line-height: 1.5;
  white-space: nowrap;
}

.pay-pill {
  display: inline-block;
  min-width: 55px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--pay-1-bg);
  color: var(--pay-1-ink);
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.pay-pill.is-t2 { background: var(--pay-2-bg); color: var(--pay-2-ink); }
.pay-pill.is-t3 { background: var(--pay-3-bg); color: var(--pay-3-ink); }
</style>
