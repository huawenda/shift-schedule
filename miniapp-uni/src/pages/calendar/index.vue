<template>
  <nav-bar action="概览 ›" @action="onOverview" />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }">
    <view class="paper sheet">
      <view class="month-row">
        <view class="month-hit" @tap="onStep"><view class="month-step">‹</view></view>
        <text class="month-title">{{ month.title }}</text>
        <view class="month-hit" @tap="onStep"><view class="month-step">›</view></view>
      </view>
      <view class="meta-row">
        <text class="range">{{ month.range }} · {{ month.days }} 天</text>
      </view>

      <!-- 今日卡：墨黑块 + 左侧朱红竖条 -->
      <view class="today-card">
        <view class="today-mark"></view>
        <view class="today-head">
          <text class="today-label">今天 · {{ today.date }} {{ today.weekday }}</text>
          <text v-if="today.time" class="today-time">{{ today.time }}</text>
        </view>
        <view class="today-main">
          <text class="today-shift">{{ today.shift }}</text>
          <view class="today-flags">
            <text v-if="today.overtime" class="flag flag-ot">+{{ today.overtime }}h 加班</text>
            <text v-if="today.legal" class="flag flag-legal">法定</text>
          </view>
        </view>
        <view v-if="today.todos" class="today-foot">
          <text class="today-todo">{{ today.todos }} 项待办</text>
        </view>
      </view>

      <view class="weekdays">
        <text
          v-for="(weekday, index) in weekdays"
          :key="weekday"
          class="weekday"
          :class="{ 'is-weekend': index === 0 || index === 6 }"
        >{{ weekday }}</text>
      </view>

      <!-- 网格：四角锚定 —— 日号左上、法定右上、农历左下、加班/事假右下，方印恒居中 -->
      <view class="grid">
        <view
          v-for="item in cells"
          :key="item.key"
          class="cell"
          :class="[item.inPeriod ? '' : 'is-outside', item.isToday ? 'is-today' : '']"
        >
          <text class="cell-day">{{ item.day }}</text>
          <text v-if="item.legal" class="flag flag-legal cell-legal">法</text>
          <text v-if="item.meta" class="cell-meta" :class="{ 'is-festival': item.isFestival }">{{ item.meta }}</text>
          <text v-if="item.otText" class="flag flag-ot cell-ot">{{ item.otText }}</text>
          <text v-else-if="item.leaveText" class="flag flag-leave cell-ot">{{ item.leaveText }}</text>
          <text
            class="cell-char"
            :class="['t-' + item.tone, item.changed ? 'is-changed' : '']"
          >{{ item.shiftShort }}</text>
        </view>
      </view>

      <!-- 页脚：色标图例 + 本月结果 -->
      <view class="foot">
        <view class="legend">
          <view class="lg"><view class="sw t-day"></view><text>白班</text></view>
          <view class="lg"><view class="sw t-night"></view><text>夜班</text></view>
          <view class="lg"><view class="sw t-rest"></view><text>休息</text></view>
          <view class="lg"><view class="sw sw-ot"></view><text>加班</text></view>
          <view class="lg"><view class="sw sw-legal"></view><text>法定</text></view>
          <view class="lg"><view class="sw sw-leave"></view><text>事假</text></view>
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
    </view>
  </view>

  <tab-bar :current="0" />
</template>

<script setup lang="ts">
import demo from '../../utils/demo.js'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'

const month = demo.period
const cells = demo.cells
const summary = demo.overview.summary
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

/** 休息日没有班次时段（数据层给的是「休息」二字，与大字重复），这里只在真有时间时显示 */
const today = {
  ...demo.today,
  time: demo.today.time === demo.today.shift ? '' : demo.today.time
}

function onOverview() {
  uni.navigateTo({ url: '/pages/overview/index' })
}

function onStep() {
  uni.showToast({ title: '演示数据只有本期', icon: 'none' })
}
</script>

<style lang="scss" scoped>
@import './style.scss';
</style>
