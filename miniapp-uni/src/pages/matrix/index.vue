<template>
  <nav-bar action="今天" @action="onToday" />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }">
    <view class="paper sheet">
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

      <view class="matrix">
        <view class="names">
          <view class="names-head"></view>
          <view v-for="row in rows" :key="row.id" class="name-row">
            <view class="name-line">
              <text class="name">{{ row.name }}</text>
              <text v-if="row.isSelf" class="badge">本人</text>
            </view>
            <text class="name-sub">{{ row.pattern }} · {{ row.position }}</text>
          </view>
        </view>

        <view class="days-wrap">
          <scroll-view class="days" scroll-x :enable-flex="true" :scroll-left="scrollLeft">
            <view class="days-inner">
              <view class="day-head">
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

              <view v-for="row in rows" :key="row.id" class="day-row">
                <view v-for="cell in row.cells" :key="cell.key" class="pill-cell">
                  <view class="pill" :class="'t-' + cell.tone">{{ cell.short }}</view>
                </view>
              </view>
            </view>
          </scroll-view>
          <view class="days-fade"></view>
        </view>
      </view>

      <view class="legend">
        <view v-for="item in legends" :key="item.label" class="legend-item">
          <view class="legend-dot" :class="'t-' + item.tone">{{ item.short }}</view>
          <text class="legend-text">{{ item.label }}</text>
        </view>
      </view>
    </view>
  </view>

  <tab-bar :current="1" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import demo from '../../utils/demo.js'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'

const summary = demo.todaySummary
const days = demo.matrix.days
const rows = demo.matrix.rows

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
  const index = days.findIndex((day: { isToday: boolean }) => day.isToday)
  if (index < 0) return
  scrollLeft.value = Math.max(0, (index - 2) * 48 * frame.rpx)
}
</script>

<style lang="scss" scoped>
@import './style.scss';
</style>
