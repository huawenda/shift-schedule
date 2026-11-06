<template>
  <view class="sheet-backdrop" @tap="$emit('close')">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <view class="sheet-head-main">
          <text class="sheet-title">{{ title }}</text>
          <text v-if="sub" class="sheet-sub">{{ sub }}</text>
        </view>
        <view v-if="closable" class="sheet-close" @tap="$emit('close')">关闭</view>
      </view>

      <view class="sheet-body">
        <slot />
      </view>

      <view v-if="foot" class="sheet-foot" :class="{ 'is-end': footEnd }">
        <slot name="foot" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 设置页统一抽屉外壳：遮罩 + 标题行 + 内容 + 可选底栏。
 * 页面只负责标题、副标与内容，避免四份 sheet 结构各自重复。
 */
withDefaults(defineProps<{
  title: string
  sub?: string
  closable?: boolean
  foot?: boolean
  footEnd?: boolean
}>(), {
  sub: '',
  closable: true,
  foot: false,
  footEnd: false
})

defineEmits<{ (event: 'close'): void }>()
</script>

<style lang="scss" scoped>
.sheet-backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  background: var(--scrim);
}

.sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 88vh;
  overflow: hidden;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--rule);
}

.sheet-head-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sheet-title {
  color: var(--text);
  font-size: var(--fs-section);
  font-weight: 600;
  line-height: 1.3;
}

.sheet-sub {
  margin-top: 2px;
  color: var(--muted);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}

.sheet-close {
  flex: 0 0 auto;
  padding: 4px 6px;
  color: var(--muted);
  font-size: var(--fs-small);
}

.sheet-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 0;
  padding: var(--sp-3);
  overflow-y: auto;
}

/* 底栏竖向排：操作行独立一行。
 * 插槽里放多个根节点时小程序会给它们包一层 view，
 * 保持竖排可避免内容横向挤压。 */
.sheet-foot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3) calc(var(--sp-3) + env(safe-area-inset-bottom));
}

.sheet-foot.is-end {
  align-items: flex-end;
}
</style>
