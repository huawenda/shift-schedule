<template>
  <nav-bar back title="本月概览" />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px' }">
    <view class="paper block">
      <view class="block-head">
        <text class="block-title">本期班次</text>
        <text class="block-note">{{ period.range }} · {{ period.days }} 天</text>
      </view>
      <view class="slips">
        <view v-for="item in counts" :key="item.label" class="slip" :class="'t-' + item.tone">
          <view class="slip-top">
            <text class="slip-value">{{ item.value }}</text>
            <text class="slip-percent">{{ item.percent }}</text>
          </view>
          <text class="slip-label">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <view class="paper block">
      <view class="block-head">
        <text class="block-title">加班分布</text>
        <text class="block-note">合计 {{ overtimeTotal }}</text>
      </view>
      <view v-for="item in ots" :key="item.kind" class="ot-row">
        <view class="ot-top">
          <text class="ot-label">{{ item.label }}</text>
          <text class="ot-hours">{{ item.hoursText }} · {{ item.share }}%</text>
          <text class="ot-pay">{{ item.payText }}</text>
        </view>
        <view class="ot-bar">
          <view class="ot-fill" :class="'kind-' + item.kind" :style="{ width: item.percent + '%' }"></view>
        </view>
      </view>
    </view>

    <view class="paper block">
      <view class="block-head">
        <text class="block-title">薪资</text>
        <text class="block-note">本月应发与实发</text>
      </view>

      <view v-for="row in earnRows" :key="row.label" class="money-row">
        <text class="money-label">{{ row.label }}</text>
        <text class="money-value">{{ row.value }}</text>
      </view>

      <view class="money-row is-strong">
        <text>应发</text>
        <text class="money-value">{{ grossText }}</text>
      </view>

      <view v-for="row in deductRows" :key="row.label" class="money-row is-deduct">
        <text class="money-label">{{ row.label }}</text>
        <text class="money-value">{{ row.value }}</text>
      </view>

      <view class="money-row is-total">
        <text>实发</text>
        <text class="money-value">{{ netText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import { rosterStore } from '../../store/roster'
import { getPeriod, formatPeriodRange } from '../../data/period'
import { getSelf } from '../../data/roster'
import { computeMonthStats, OVERTIME_KIND_LABEL } from '../../data/stats'
import { formatMoney } from '../../data/profile'

const store = rosterStore
const roster = computed(() => store.state.roster)
const self = computed(() => getSelf(roster.value))
const period = computed(() => {
  const value = getPeriod(store.state.month)
  return { ...value, range: formatPeriodRange(value), days: value.dates.length }
})

const stats = computed(() => (
  self.value ? computeMonthStats(roster.value, self.value, period.value) : null
))

const money = (value: number) => '¥' + formatMoney(value)

/** 六格班次贴片：白特 / 夜特合并成「特勤」，法定单独一格（与桌面端概览同一口径） */
const counts = computed(() => {
  const days = stats.value?.days
  const total = period.value.days || 1
  const list = [
    { label: '白班', value: days?.day ?? 0, tone: 'day' },
    { label: '夜班', value: days?.night ?? 0, tone: 'night' },
    { label: '休息', value: days?.rest ?? 0, tone: 'rest' },
    { label: '特勤', value: (days?.daySpecial ?? 0) + (days?.nightSpecial ?? 0), tone: 'dayx' },
    { label: '事假', value: days?.leave ?? 0, tone: 'leave' },
    { label: '法定', value: days?.legal ?? 0, tone: 'legal' }
  ]
  return list.map(item => ({
    ...item,
    percent: Math.round((item.value / total) * 100) + '%'
  }))
})

/** 三个计价桶：条长按当月最大值归一化，文字里的占比按总量 */
const ots = computed(() => {
  const overtime = stats.value?.overtime
  const salary = stats.value?.salary
  const rows = [
    { kind: 'weekday' as const, hours: overtime?.weekday ?? 0, pay: salary?.weekdayPay ?? 0 },
    { kind: 'special' as const, hours: overtime?.special ?? 0, pay: salary?.specialPay ?? 0 },
    { kind: 'legal' as const, hours: overtime?.legal ?? 0, pay: salary?.legalPay ?? 0 }
  ]
  const total = overtime?.total ?? 0
  const max = Math.max(...rows.map(row => row.hours), 1)

  return rows.map(row => ({
    label: OVERTIME_KIND_LABEL[row.kind],
    kind: row.kind,
    hoursText: row.hours + 'h',
    payText: money(row.pay),
    percent: Math.round((row.hours / max) * 100),
    share: total > 0 ? Math.round((row.hours / total) * 100) : 0
  }))
})

const overtimeTotal = computed(() => (stats.value ? stats.value.overtime.total : 0) + 'h')

const salary = computed(() => stats.value?.salary ?? null)

const earnRows = computed(() => {
  const value = salary.value
  return [
    { label: '固定应发', value: money(value?.fixedTotal ?? 0) },
    { label: '平日加班', value: money(value?.weekdayPay ?? 0) },
    { label: '特勤加班', value: money(value?.specialPay ?? 0) },
    { label: '法定加班', value: money(value?.legalPay ?? 0) },
    { label: '夜班津贴', value: money(value?.nightAllowance ?? 0) }
  ]
})

const deductRows = computed(() => {
  const value = salary.value
  return [
    { label: '社保公积金', value: '−' + money(value?.socialFund ?? 0) },
    { label: '事假扣款', value: '−' + money(value?.leaveDeduction ?? 0) }
  ]
})

const grossText = computed(() => money(salary.value?.gross ?? 0))
const netText = computed(() => money(salary.value?.net ?? 0))
</script>

<style lang="scss" scoped>
/* padding-top 由模板的 :style 注入（frame.navHeight），这里只写左右与底部 ——
 * 写 `padding` 简写会把顶部覆盖成 0，卡片就直接顶在导航栏上。 */
.page {
  min-height: 100vh;
  padding-left: var(--gap-md);
  padding-right: var(--gap-md);
  padding-bottom: var(--gap-xl);
  box-sizing: border-box;
}

.block {
  padding: var(--gap-md);
  margin-top: var(--gap-md);
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--gap-sm);
  border-bottom: 2rpx solid var(--rule);
}

.block-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.block-note {
  color: var(--muted);
  font-size: var(--fs-micro);
}

/* ------------------------------------------------------------ 班次贴片 */

/* 六格整块铺班次浅底 + 墨色字，格间只留 8rpx 间隙、不画分隔线 */
.slips {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-xs);
  margin-top: var(--gap-sm);
}

.slip {
  padding: var(--gap-sm) var(--gap-md) 12rpx;
  border-radius: var(--radius-block);
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

/* 数值与占比同一行：占比小、退在右上角，不抢数字 */
.slip-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.slip-value {
  font-family: var(--font-mono);
  font-size: var(--fs-title);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.slip-percent {
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  opacity: 0.62;
  font-variant-numeric: tabular-nums;
}

.slip-label {
  font-size: var(--fs-micro);
  opacity: 0.82;
}

/* 法定不是班次色，用警示色系里最浅的一档，与黄角标同源 */
.t-legal {
  background: var(--warning-bg);
  color: var(--warning-ink);
}

/* ------------------------------------------------------------ 加班分布 */

.ot-row {
  margin-top: var(--gap-md);
}

.ot-top {
  display: flex;
  align-items: baseline;
  gap: var(--gap-sm);
}

.ot-label {
  flex: 1 1 auto;
  font-size: var(--fs-meta);
}

.ot-hours {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  font-variant-numeric: tabular-nums;
}

.ot-pay {
  min-width: 140rpx;
  text-align: right;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 条只有 12rpx 高：再高就变成图表，这里只需要「谁占大头」 */
.ot-bar {
  margin-top: 10rpx;
  height: 12rpx;
  border-radius: 999rpx;
  background: var(--rule);
  overflow: hidden;
}

.ot-fill {
  height: 100%;
  border-radius: 999rpx;
}

/* 三档用三个色相，不是同一支色的深浅 —— 深浅在小屏上会糊成一片 */
.kind-weekday {
  background: var(--accent);
}

.kind-special {
  background: var(--overtime-bg);
}

.kind-legal {
  background: var(--warning-ink);
}

/* ------------------------------------------------------------ 薪资 */

.money-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10rpx 0;
}

.money-label {
  color: var(--muted);
  font-size: var(--fs-meta);
}

.money-value {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-variant-numeric: tabular-nums;
}

/* 应发：明细到这里收口。标签退到辅助色，数值升一档 */
.money-row.is-strong {
  margin-top: var(--gap-xs);
  padding: 14rpx 0 10rpx;
  border-top: 2rpx solid var(--border-strong);
}

.money-row.is-strong .money-value {
  font-size: var(--fs-body);
  font-weight: 600;
}

.money-row.is-deduct .money-value {
  color: var(--muted);
}

/* 实发：与「应发」同字号、同粗细、同对齐，只靠底色区分。
 * 左右用 -8rpx 外边距 + 8rpx 内边距，把底色铺到文字两侧又不贴住卡片边线。 */
.money-row.is-total {
  margin: var(--gap-xs) calc(-1 * var(--gap-xs)) 0;
  padding: 10rpx var(--gap-xs);
  border-radius: var(--radius-control);
  background: var(--accent-weak);
}

.money-row.is-total .money-value {
  font-size: var(--fs-body);
  font-weight: 600;
}
</style>
