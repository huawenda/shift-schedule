<template>
  <view class="tabbar" :style="{ height: frame.tabBarHeight + 'px', paddingBottom: frame.safeBottom + 'px' }">
    <view
      v-for="item in list"
      :key="item.path"
      class="tab"
      :class="{ 'is-on': current === item.index }"
      @tap="go(item)"
    >
      <view class="glyph">
        <view v-if="item.icon === 'calendar'" class="g-cal">
          <view class="g-cal-bar"></view>
        </view>
        <view v-else-if="item.icon === 'matrix'" class="g-matrix">
          <view v-for="cell in 4" :key="cell" class="g-cell"></view>
        </view>
        <view v-else class="g-bars">
          <view class="g-bar is-long"></view>
          <view class="g-bar is-mid"></view>
          <view class="g-bar is-short"></view>
        </view>
      </view>
      <text class="tab-label">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { frame } from '../utils/app-frame'

const props = defineProps<{ current: number }>()

/**
 * pages.json 里配了 tabBar.custom = true（原生栏由 custom-tab-bar 占位、不渲染），
 * 所以这里能用 switchTab：三个 tab 页只在第一次进入时创建，之后复用同一份 WebView。
 * 之前的 reLaunch 每次都重建页面，那一帧空白就是闪白的根源。
 */
const list = [
  { index: 0, text: '日历', icon: 'calendar', path: '/pages/calendar/index' },
  { index: 1, text: '矩阵', icon: 'matrix', path: '/pages/matrix/index' },
  { index: 2, text: '设置', icon: 'settings', path: '/pages/settings/index' }
]

/** 连点会连切两下，300ms 内只认第一下 */
let switching = false

function go(item: { index: number; path: string }) {
  if (switching || item.index === props.current) return
  switching = true
  uni.switchTab({
    url: item.path,
    complete: () => {
      setTimeout(() => {
        switching = false
      }, 300)
    }
  })
}
</script>

<style lang="scss" scoped>
/*
 * 颜色写死：mp-weixin 的自定义组件默认样式隔离，page 上的 CSS 变量不保证继承。
 * 四个值与 styles/tokens.scss 同源，改色时两处一起改。
 */
.tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  overflow: hidden;
  background: #171512;
  border-top: 1px solid #2c2822;
}

.tab {
  flex: 1 1 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: #867e6f;
}

/* 选中整项转暖沙：图标与文字都用 currentColor，一处改色全部跟上 */
.tab.is-on {
  color: #e8c58b;
}

.tab-label {
  font-size: 20rpx;
  line-height: 1.2;
}

.tab.is-on .tab-label {
  font-weight: 600;
}

/* ------------------------------------------------------------ 图标
 * 三个图标都用 view 拼，不引入图片：深青底上的小线性图标容易糊。 */

.glyph {
  width: 34rpx;
  height: 34rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 日历：细线方框 + 表头横线 */
.g-cal {
  position: relative;
  width: 30rpx;
  height: 30rpx;
  border: 2rpx solid currentColor;
  border-radius: 4rpx;
  box-sizing: border-box;
}

.g-cal-bar {
  position: absolute;
  top: 6rpx;
  right: 0;
  left: 0;
  height: 2rpx;
  background: currentColor;
  opacity: 0.7;
}

/* 矩阵：2 × 2 空心小方块 */
.g-matrix {
  width: 30rpx;
  height: 30rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.g-cell {
  width: 11rpx;
  height: 11rpx;
  border: 2rpx solid currentColor;
  border-radius: 2rpx;
  box-sizing: border-box;
}

/* 设置：三条递减横线 */
.g-bars {
  width: 30rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6rpx;
}

.g-bar {
  height: 2rpx;
  border-radius: 1rpx;
  background: currentColor;
}

.g-bar.is-long {
  width: 30rpx;
}

.g-bar.is-mid {
  width: 22rpx;
}

.g-bar.is-short {
  width: 14rpx;
}
</style>
