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
        <text class="members-note">{{ usersText || '暂无' }}</text>
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
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import { rosterStore } from '../../store/roster'
import { MAX_CUSTOM_PATTERNS, isBuiltinPatternId, resolvePatterns } from '../../data/patterns'
import { SHIFT_META, type ShiftType } from '../../data/shifts'

/** 班序格子里只能填这三种：白特 / 夜特 / 事假 是单天的临时决定，不进 24 天循环 */
const CYCLE: ShiftType[] = ['白班', '夜班', '休息']

const store = rosterStore
const roster = computed(() => store.state.roster)

const patternId = ref('4F')

const lookup = computed(() => resolvePatterns(roster.value.patterns))
const pattern = computed(() => lookup.value.get(patternId.value))
const builtin = computed(() => isBuiltinPatternId(patternId.value))
const title = computed(() => lookup.value.labelOf(patternId.value))

const users = computed(() => roster.value.members.filter(member => member.patternId === patternId.value))
const userNames = computed(() => users.value.map(member => member.name))
const usersText = computed(() => (users.value.length ? users.value.length + ' 人' : ''))

const cells = computed(() => (pattern.value ? pattern.value.shifts : []).map((shift, index) => ({
  day: String(index + 1).padStart(2, '0'),
  shift,
  short: SHIFT_META[shift].short,
  tone: SHIFT_META[shift].tone
})))

onLoad((query: Record<string, string> | undefined) => {
  const id = (query && query.id) || '4F'
  patternId.value = lookup.value.has(id) ? id : '4F'
})

function onTap(index: number) {
  if (builtin.value) {
    uni.showToast({ title: '内置班序不可修改', icon: 'none' })
    return
  }

  const target = roster.value.patterns.find(item => item.id === patternId.value)
  if (!target) return

  const current = target.shifts[index]
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
  const shifts = target.shifts.slice()
  shifts[index] = next
  store.savePattern({ ...target, shifts })
}

/** 内置班序只读：复制成一条自定义班序，名字避开已有重名 */
function onCopy() {
  if (roster.value.patterns.length >= MAX_CUSTOM_PATTERNS) {
    uni.showToast({ title: `自定义班序最多 ${MAX_CUSTOM_PATTERNS} 条`, icon: 'none' })
    return
  }

  const base = `${title.value}·副本`
  const names = new Set(roster.value.patterns.map(item => item.name))
  let name = base
  let index = 2
  while (names.has(name)) {
    name = `${base}-${index}`
    index += 1
  }

  const source = lookup.value.get(patternId.value)
  if (!source) return

  const id = 'cp-' + Date.now().toString(36)
  store.savePattern({ id, name, shifts: [...source.shifts] })
  uni.redirectTo({ url: '/pages/pattern/index?id=' + id })
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
