<template>
  <view class="nav" :style="{ paddingTop: frame.statusBarHeight + 'px' }">
    <!-- 二级页：返回 + 标题（设置里的成员 / 班序子页） -->
    <view v-if="back" class="subbar">
      <view class="nav-back" hover-class="is-pressed" @tap="onBack">
        <view class="chevron is-left"></view>
      </view>
      <text class="sub-title">{{ title }}</text>
    </view>

    <!-- 一级页：与桌面手机档同一枚月份胶囊；右侧给微信胶囊让位 -->
    <view v-else class="topbar" :style="{ paddingRight: Math.max(16, frame.capsuleInset) + 'px' }">
      <view class="month-track">
        <view class="month-switch">
          <view class="month-step" hover-class="is-pressed" @tap="step(-1)">
            <view class="chevron is-left"></view>
          </view>
          <text class="month-title">{{ monthTitle }}</text>
          <view class="month-step" hover-class="is-pressed" @tap="step(1)">
            <view class="chevron is-right"></view>
          </view>
          <view
            class="month-today"
            :class="{ 'is-disabled': atCurrent }"
            hover-class="is-pressed"
            @tap="onToday"
          >回到本月</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { frame } from '../utils/app-frame'
import { rosterStore } from '../store/roster'
import { currentMonthKey, formatMonthTitle } from '../data/period'

withDefaults(defineProps<{ back?: boolean; title?: string }>(), {
  back: false,
  title: ''
})

const store = rosterStore
const monthTitle = computed(() => formatMonthTitle(store.state.month))
const atCurrent = computed(() => {
  const current = currentMonthKey()
  return store.state.month.year === current.year && store.state.month.month === current.month
})

function step(delta: number) {
  store.stepMonth(delta)
}

function onToday() {
  if (!atCurrent.value) store.goCurrentMonth()
}

function onBack() {
  uni.navigateBack({ delta: 1 })
}
</script>

<style lang="scss" scoped>
.nav {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  background: var(--chrome);
  color: var(--chrome-muted);
}

/* ------------------------------------------------------------ 一级页：月份胶囊 */

.topbar {
  display: flex;
  align-items: center;
  height: 48px;
  padding-left: 16px;
  box-sizing: border-box;
}

.month-track {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

/* 与桌面 `.month-switch` 同款：外框 + 分段步进 + 左右发丝线 */
.month-switch {
  display: flex;
  align-items: stretch;
  height: 36px;
  overflow: hidden;
  border: 1px solid var(--chrome-line);
  border-radius: var(--radius-control);
  background: var(--chrome-raised);
}

.month-step {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
}

.month-title {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 116px;
  padding: 0 10px;
  border-right: 1px solid var(--chrome-line);
  border-left: 1px solid var(--chrome-line);
  color: var(--chrome-text);
  font-size: var(--fs-control);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.month-today {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-left: 1px solid var(--chrome-line);
  color: var(--chrome-accent);
  font-size: var(--fs-control);
  font-weight: 500;
  white-space: nowrap;
}

.month-today.is-disabled {
  color: var(--chrome-faint);
}

.is-pressed {
  background: var(--chrome-wash);
}

/* CSS 画箭头：桌面用的是内联 SVG，字体里的 ‹ › 会随字体变形 */
.chevron {
  width: 7px;
  height: 7px;
  border-bottom: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
}

.chevron.is-left {
  transform: rotate(45deg);
}

.chevron.is-right {
  transform: rotate(-135deg);
}

/* ------------------------------------------------------------ 二级页 */

.subbar {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
}

.nav-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 48px;
  margin-left: -8px;
  color: var(--chrome-text);
}

.sub-title {
  margin-left: 4px;
  color: var(--chrome-text);
  font-size: var(--fs-body);
  font-weight: 600;
}

/* 360 窄屏：微信胶囊更宽，月份胶囊收一档，避免压到胶囊下面 */
@media (max-width: 370px) {
  .month-title {
    min-width: 88px;
    padding: 0 6px;
  }

  .month-today {
    padding: 0 8px;
  }
}
</style>
