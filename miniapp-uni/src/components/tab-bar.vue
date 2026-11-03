<template>
  <view class="tabbar-host" :style="{ paddingBottom: frame.safeBottom + 'px' }">
    <view class="tabbar">
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
        <view v-else class="g-settings">
          <view class="g-slider">
            <view class="g-line"></view>
            <view class="g-knob is-right"></view>
          </view>
          <view class="g-slider">
            <view class="g-line"></view>
            <view class="g-knob is-left"></view>
          </view>
        </view>
      </view>
      <text class="tab-label">{{ item.text }}</text>
    </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { frame } from '../utils/app-frame'

const props = defineProps<{ current: number }>()

/**
 * pages.json 里配了 tabBar.custom = true（原生栏由 custom-tab-bar 占位、不渲染），
 * 所以这里能用 switchTab：三个 tab 页只在第一次进入时创建，之后复用同一份 WebView。
 */
const list = [
  { index: 0, text: '月度概览', icon: 'calendar', path: '/pages/overview/index' },
  { index: 1, text: '全员矩阵', icon: 'matrix', path: '/pages/matrix/index' },
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
/* C 方案：底栏取系统底部导航栏同款浅灰，有没有手势条都不会出现接缝 */
.tabbar-host {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  /* 安全区与底栏同一颜色，铺到屏幕最底 */
  background: var(--surface-nav);
}

.tabbar {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 57px;
  padding: 4px 8px;
  overflow: hidden;
  border-top: 1px solid var(--rule);
  background: var(--surface-nav);
  box-sizing: border-box;
}

.tab {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 48px;
  border-radius: var(--radius-card);
  color: var(--muted);
  font-size: var(--fs-label);
}

.tab.is-on {
  background: var(--accent-soft);
  color: var(--accent);
}

.tab-label {
  line-height: 1;
}

/* ------------------------------------------------------------ 图标
 * 18px，与桌面底栏一致；全部用 view 拼，不引入图片。 */

.glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

/* 日历：方框 + 表头横线 */
.g-cal {
  position: relative;
  width: 16px;
  height: 16px;
  border: 1.3px solid currentColor;
  border-radius: 3px;
}

.g-cal-bar {
  position: absolute;
  top: 4px;
  right: 0;
  left: 0;
  height: 1.3px;
  background: currentColor;
  opacity: 0.75;
}

/* 矩阵：2 × 2 空心小方块 */
.g-matrix {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  width: 16px;
  height: 16px;
}

.g-cell {
  width: 6px;
  height: 6px;
  border: 1.3px solid currentColor;
  border-radius: 1.5px;
}

/* 设置：两条推子 + 两个空心圆点 */
.g-settings {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  width: 16px;
  height: 16px;
}

.g-slider {
  position: relative;
  height: 1.3px;
  background: currentColor;
}

.g-knob {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  border: 1.2px solid currentColor;
  border-radius: 50%;
  transform: translateY(-50%);
}

.g-knob.is-right {
  right: 2px;
}

.g-knob.is-left {
  left: 2px;
}
</style>
