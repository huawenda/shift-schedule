<template>
  <nav-bar back :title="title" />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px' }">
    <view class="head">
      <text class="head-title">24 天循环</text>
      <text class="head-note">{{ builtin ? '内置班序 · 只读' : '自定义班序 · 可编辑' }}</text>
    </view>

    <view class="grid">
      <view
        v-for="(item, index) in cells"
        :key="item.day"
        class="cell"
        :class="['t-' + item.tone, builtin ? 'is-readonly' : '']"
        @tap="onTap(index)"
      >
        <text class="cell-index">{{ item.day }}</text>
        <text class="cell-shift">{{ item.short }}</text>
      </view>
    </view>

    <text class="foot">{{ builtin ? '内置班序照搬真实四班两倒节奏，不能改' : '点一下：白 → 夜 → 休 循环' }}</text>

    <!-- 使用成员：班序页下方原来是一大片空白，这里补上「谁在用」 -->
    <view class="members">
      <view class="members-head">
        <text class="members-title">使用成员</text>
        <text class="members-note">{{ users || '暂无' }}</text>
      </view>
      <view v-if="userNames.length" class="chips">
        <text v-for="name in userNames" :key="name" class="chip">{{ name }}</text>
      </view>
      <text v-else class="members-empty">还没有成员用这条班序</text>
    </view>

    <view v-if="builtin" class="btn-primary" @tap="onCopy">复制为自定义班序</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import demo from '../../utils/demo.js'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'

/** 班序格子里只能填这三种：白特 / 夜特 / 事假 是单天的临时决定，不进 24 天循环 */
const CYCLE = ['白班', '夜班', '休息']
const META = demo.labels.shift

type Cell = { day: string; shift: string; short: string; tone: string }

function cellOf(shift: string, index: number): Cell {
  return {
    day: String(index + 1).padStart(2, '0'),
    shift,
    short: META[shift].short,
    tone: META[shift].tone
  }
}

const title = ref('')
const builtin = ref(true)
const users = ref('')
const userNames = ref<string[]>([])
const cells = ref<Cell[]>([])

onLoad((query: Record<string, string> | undefined) => {
  const id = (query && query.id) || '4F'
  const pattern = demo.patterns.filter((item: { id: string }) => item.id === id)[0] || demo.patterns[0]
  const matched = demo.members.filter((member: { pattern: string }) => member.pattern === pattern.id)

  title.value = pattern.name
  builtin.value = pattern.builtin
  users.value = matched.length ? matched.length + ' 人' : ''
  userNames.value = matched.map((member: { name: string }) => member.name)
  cells.value = pattern.shifts.map((shift: string, index: number) => cellOf(shift, index))
})

function onTap(index: number) {
  if (builtin.value) {
    uni.showToast({ title: '内置班序不可修改', icon: 'none' })
    return
  }

  const current = cells.value[index]
  const next = CYCLE[(CYCLE.indexOf(current.shift) + 1) % CYCLE.length]
  const list = cells.value.slice()
  list[index] = cellOf(next, index)
  cells.value = list
}

function onCopy() {
  uni.showToast({ title: '演示阶段暂未接通', icon: 'none' })
}
</script>

<style lang="scss">
/* 班序页整页就是纸 */
page {
  background: var(--surface);
}
</style>

<style lang="scss" scoped>
/* padding-top 由模板的 :style 注入（frame.navHeight），这里只写左右与底部 */
.page {
  min-height: 100vh;
  padding-left: var(--gap-md);
  padding-right: var(--gap-md);
  padding-bottom: var(--gap-md);
  box-sizing: border-box;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: var(--gap-md);
  padding: 0 4rpx var(--gap-sm);
}

.head-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.head-note {
  color: var(--muted);
  font-size: var(--fs-micro);
}

/* 24 格：6 列 × 4 行。宽 (750 − 48 − 5 × 8) / 6 ≈ 110rpx，够点 */
.grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--gap-xs);
}

.cell {
  height: 104rpx;
  border-radius: var(--radius-block);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
}

.cell.is-readonly:active {
  opacity: 0.8;
}

.cell-index {
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  line-height: 1.1;
  opacity: 0.65;
}

.cell-shift {
  font-size: var(--fs-body);
  font-weight: 600;
  line-height: 1.2;
}

.foot {
  display: block;
  margin-top: var(--gap-md);
  color: var(--faint);
  font-size: var(--fs-micro);
  text-align: center;
}

/* ------------------------------------------------------------ 使用成员 */

.members {
  margin-top: var(--gap-xl);
  padding-top: var(--gap-md);
  border-top: 2rpx solid var(--rule);
}

.members-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.members-title {
  color: var(--muted);
  font-size: var(--fs-meta);
}

.members-note {
  color: var(--faint);
  font-size: var(--fs-micro);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: var(--gap-sm);
}

.chip {
  padding: 8rpx 20rpx;
  border-radius: var(--radius-sub);
  background: var(--surface-sunken);
  color: var(--text);
  font-size: var(--fs-meta);
}

.members-empty {
  display: block;
  margin-top: var(--gap-sm);
  color: var(--faint);
  font-size: var(--fs-micro);
}

/* ------------------------------------------------------------ 底部按钮 */

.btn-primary {
  margin-top: var(--gap-xl);
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: var(--radius-control);
  background: var(--text);
  color: var(--text-inverse);
  font-size: var(--fs-control);
  font-weight: 600;
}

.btn-primary:active {
  opacity: 0.88;
}
</style>
