<template>
  <view class="brand-card">
    <!-- 应用标识：一个圆，上半白昼、下半夜，夜里一点星。
         与 design/logo/logo.svg 同比例（192 基准缩到 44px）；
         小程序里全部用 view 拼，不引图片（svg 静态引用会让组件在运行时加载失败）。 -->
    <view class="brand-mark">
      <view class="mark-night"></view>
      <view class="mark-day"></view>
      <view class="mark-star">
        <view class="star-up"></view>
        <view class="star-down"></view>
        <view class="star-left"></view>
        <view class="star-right"></view>
      </view>
    </view>

    <view class="brand-text">
      <text class="brand-name">昼夜</text>
      <text class="brand-sub">个人倒班记录本</text>
      <text v-if="hint" class="brand-hint">{{ hint }}</text>
      <view class="brand-tick"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ hint?: string }>(), {
  hint: ''
})
</script>

<style lang="scss" scoped>
/* 品牌卡：桌面侧栏品牌区（.rail-brand）的手机版。
 * 深青底 + 暖沙短线，颜色都来自品牌令牌。 */
.brand-card {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-dialog);
  background: var(--chrome);
}

/* ------------------------------------------------------------ 应用标识 52px
 * 52 与右侧文字块等高（20×1.2 + 2 + 12×1.5 + 2 + 暖沙线 7 ≈ 53），
 * 标识不再比字标矮一头。 */

.brand-mark {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--brand-ink);
  /* 深框上给标识留一圈极淡石光线，深青盘不至于和背景糊成一块 */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

/* 夜：直径 58×2/192×52 = 31.42 */
.mark-night {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 31.42px;
  height: 31.42px;
  border-radius: 50%;
  background: var(--brand-night);
  transform: translate(-50%, -50%);
}

/* 昼：上半圆，与夜圆同心 */
.mark-day {
  position: absolute;
  top: calc(50% - 15.71px);
  left: 50%;
  width: 31.42px;
  height: 15.71px;
  border-radius: 15.71px 15.71px 0 0;
  background: var(--brand-day);
  transform: translateX(-50%);
}

/* 星：四角星，中心在原图 y=124（中心线下方 28），缩到 52px 是下移 7.58 */
.mark-star {
  position: absolute;
  top: calc(50% + 2.71px);
  left: 50%;
  width: 9.75px;
  height: 9.75px;
  transform: translateX(-50%);
}

/* 四个三角拼出尖角朝外的四角星 */
.star-up,
.star-down,
.star-left,
.star-right {
  position: absolute;
  width: 0;
  height: 0;
}

.star-up {
  top: 0;
  left: 2.43px;
  border-right: 2.43px solid transparent;
  border-bottom: 4.87px solid var(--brand-star);
  border-left: 2.43px solid transparent;
}

.star-down {
  bottom: 0;
  left: 2.43px;
  border-top: 4.87px solid var(--brand-star);
  border-right: 2.43px solid transparent;
  border-left: 2.43px solid transparent;
}

.star-left {
  top: 2.43px;
  left: 0;
  border-top: 2.43px solid transparent;
  border-right: 4.87px solid var(--brand-star);
  border-bottom: 2.43px solid transparent;
}

.star-right {
  top: 2.43px;
  right: 0;
  border-top: 2.43px solid transparent;
  border-bottom: 2.43px solid transparent;
  border-left: 4.87px solid var(--brand-star);
}

/* ------------------------------------------------------------ 字标 */

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 衬线 + 真 700：与正文黑体拉开形态差别，读起来是品牌而不是一行界面文字。
 * 字距 0.1em：两字品牌收紧会缩成一团，拉开后各自成形。 */
.brand-name {
  color: var(--chrome-text);
  font-family: var(--font-brand);
  font-size: var(--fs-metric-md);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.1em;
}

.brand-sub {
  color: var(--chrome-muted);
  font-size: var(--fs-small);
  line-height: 1.5;
}

.brand-hint {
  color: var(--chrome-accent);
  font-size: var(--fs-small);
  line-height: 1.5;
}

/* 暖沙短线：宽度跟随文字块，正好成为副标的下划线 */
.brand-tick {
  align-self: stretch;
  height: 3px;
  margin-top: 4px;
  border-radius: var(--radius-pill);
  background: var(--brand-day);
}
</style>
