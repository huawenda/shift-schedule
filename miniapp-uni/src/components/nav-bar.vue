<template>
  <view class="nav" :style="{ paddingTop: frame.statusBarHeight + 'px' }">
    <view class="nav-inner">
      <view class="nav-left">
        <view v-if="back" class="nav-back" @tap="onBack">‹</view>
        <text v-if="title" class="nav-title">{{ title }}</text>
        <text v-else class="nav-brand">昼夜</text>
      </view>
      <view v-if="action" class="nav-action" @tap="onAction">{{ action }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { frame } from '../utils/app-frame'

withDefaults(defineProps<{ back?: boolean; title?: string; action?: string }>(), {
  back: false,
  title: '',
  action: ''
})

const emit = defineEmits<{ (event: 'action'): void }>()

/** 二级页的返回：与原生版一致，只退一层 */
function onBack() {
  uni.navigateBack({ delta: 1 })
}

function onAction() {
  emit('action')
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
  border-bottom: 1px solid var(--chrome-line);
}

.nav-inner {
  height: 88rpx;
  padding-left: var(--gap-md);
  /* 右上角是微信的系统胶囊（约 174rpx 宽），右侧动作必须让开 */
  padding-right: 190rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-left {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* 返回键做 88rpx 见方，再用负外边距把视觉位置收回左缘 */
.nav-back {
  width: 88rpx;
  height: 88rpx;
  margin-left: -20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--chrome-text);
  font-size: var(--fs-title);
  line-height: 1;
}

.nav-back:active {
  opacity: 0.7;
}

/* 品牌字：衬线，字距拉开，读起来是一本册子的名字 */
.nav-brand {
  color: var(--chrome-text);
  font-family: var(--font-brand);
  font-size: var(--fs-section);
  letter-spacing: 0.14em;
  line-height: 1;
}

.nav-title {
  color: var(--chrome-text);
  font-size: var(--fs-body);
  font-weight: 600;
}

.nav-action {
  min-width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--chrome-muted);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  letter-spacing: 0.06em;
}

.nav-action:active {
  color: var(--chrome-text);
}
</style>
