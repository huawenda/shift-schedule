<template>
  <view class="pattern-grid">
    <view v-for="row in rows" :key="row.start" class="pattern-grid-row">
      <view
        v-for="cell in row.cells"
        :key="cell.index"
        class="shift-cell"
        :class="['t-' + cell.tone, { 'is-on': active === cell.index, 'is-readonly': readonly }]"
        @tap="onPick(cell.index)"
      >
        <text class="shift-cell-num">{{ cell.index + 1 }}</text>
        <text class="shift-cell-text">{{ cell.short }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SHIFT_META, type ShiftType } from '../data/shifts'

const props = withDefaults(defineProps<{
  shifts: ShiftType[]
  /** 编辑态选中的格子；-1 表示没有选中 */
  active?: number
  /** 只读：点了也不会发出 pick */
  readonly?: boolean
}>(), {
  active: -1,
  readonly: false
})

const emit = defineEmits<{ (event: 'pick', index: number): void }>()

/** 两行各 12 格：24 格一行在手机上每格不到 20px，两字班次放不下 */
const rows = computed(() => [0, 12].map(start => ({
  start,
  cells: props.shifts.slice(start, start + 12).map((shift, offset) => ({
    index: start + offset,
    short: SHIFT_META[shift].short,
    tone: SHIFT_META[shift].tone
  }))
})))

function onPick(index: number) {
  if (props.readonly) return
  emit('pick', index)
}
</script>

<style lang="scss" scoped>
/* 桌面 `.pattern-grid` / `.shift-cell` 的 ≤639 档：12 列、gap 3、格子 38px */
.pattern-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pattern-grid-row {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 3px;
}

.shift-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  height: 38px;
  border-radius: var(--radius-sub);
  line-height: 1.1;
}

.shift-cell.is-on {
  box-shadow: inset 0 0 0 1px var(--text);
}

.shift-cell-num {
  font-size: var(--fs-micro);
  font-variant-numeric: tabular-nums;
  opacity: 0.65;
}

.shift-cell-text {
  font-size: var(--fs-label);
}
</style>
