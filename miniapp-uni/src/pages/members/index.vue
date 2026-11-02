<template>
  <nav-bar back title="人员配置" />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px' }">
    <view class="seg">
      <view class="seg-item" :class="{ 'is-on': tab === 'member' }" @tap="tab = 'member'">成员 {{ members.length }}</view>
      <view class="seg-item" :class="{ 'is-on': tab === 'pattern' }" @tap="tab = 'pattern'">班序 {{ patterns.length }}</view>
    </view>

    <view v-if="tab === 'member'" class="list">
      <view v-for="item in members" :key="item.id" class="row" @tap="onMember(item)">
        <view class="avatar">{{ item.initial }}</view>
        <view class="row-main">
          <view class="row-line">
            <text class="row-title">{{ item.name }}</text>
            <text v-if="item.isSelf" class="badge">本人</text>
          </view>
          <text class="row-sub">{{ item.pattern }} · {{ item.position }}</text>
        </view>
        <text class="row-arrow">›</text>
      </view>
      <view class="add-btn" @tap="onAdd">＋ 添加成员</view>
    </view>

    <view v-else class="list">
      <view v-for="item in patterns" :key="item.id" class="row" @tap="onPattern(item)">
        <view class="row-main">
          <view class="row-line">
            <text class="row-title">{{ item.name }}</text>
            <text class="row-tag">{{ item.builtin ? '内置' : '自定义' }}</text>
          </view>
          <!-- 24 段缩略色条：一条班序的节奏，看这一排就够了 -->
          <view class="bars">
            <view v-for="(bar, index) in item.bars" :key="index" class="bar" :class="'t-' + bar"></view>
          </view>
        </view>
        <text class="row-note">{{ item.users }} 人</text>
        <text class="row-arrow">›</text>
      </view>
      <view class="add-btn is-muted" @tap="onAdd">＋ 新建班序</view>
    </view>
  </view>

  <!-- 成员编辑抽屉 -->
  <view v-if="editor" class="backdrop" @tap="onClose">
    <view class="sheet" @tap.stop="onStop">
      <view class="sheet-head">
        <text class="sheet-title">{{ editor.mode === 'add' ? '添加成员' : '编辑成员' }}</text>
        <text class="sheet-close" @tap="onClose">关闭</text>
      </view>

      <view class="field">
        <text class="field-label">姓名</text>
        <input class="input" :value="editor.name" placeholder="必填" @input="onNameInput" />
      </view>

      <view class="field">
        <text class="field-label">岗位</text>
        <input class="input" :value="editor.position" placeholder="可空" @input="onPositionInput" />
      </view>

      <view class="field">
        <text class="field-label">班序</text>
        <scroll-view class="chips" scroll-x :enable-flex="true">
          <view
            v-for="item in patterns"
            :key="item.id"
            class="chip"
            :class="{ 'is-on': editor.patternId === item.id }"
            @tap="editor.patternId = item.id"
          >{{ item.name }}</view>
        </scroll-view>
      </view>

      <view class="switch-row" @tap="editor.isSelf = !editor.isSelf">
        <view class="switch-text">
          <text class="switch-label">设为本人</text>
          <text class="switch-note">日历只显示本人</text>
        </view>
        <view class="switch" :class="{ 'is-on': editor.isSelf }">
          <view class="knob"></view>
        </view>
      </view>

      <view class="sheet-foot">
        <text class="btn-danger" :class="{ 'is-disabled': !canDelete }" @tap="onDelete">删除</text>
        <view class="foot-actions">
          <view class="btn" @tap="onClose">取消</view>
          <view class="btn btn-primary" :class="{ 'is-disabled': !canSave }" @tap="onSave">保存</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import demo from '../../utils/demo.js'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'

const META = demo.labels.shift

type Member = { id: string; name: string; pattern: string; position: string; isSelf: boolean; initial: string }
type Editor = { mode: 'add' | 'edit'; id: string; name: string; position: string; patternId: string; isSelf: boolean }

function toMember(member: { id: string; name: string; pattern: string; position: string }): Member {
  return {
    ...member,
    isSelf: member.id === 'm-01',
    initial: member.name.slice(0, 1)
  }
}

const tab = ref<'member' | 'pattern'>('member')
const members = ref<Member[]>(demo.members.map(toMember))
const patterns = ref(
  demo.patterns.map((pattern: any) => ({
    ...pattern,
    bars: pattern.shifts.map((shift: string) => META[shift].tone)
  }))
)
const editor = ref<Editor | null>(null)

const canSave = computed(() => Boolean(editor.value && editor.value.name.trim().length > 0))
const canDelete = computed(() => Boolean(editor.value && editor.value.mode === 'edit' && members.value.length > 1))

function onMember(member: Member) {
  editor.value = {
    mode: 'edit',
    id: member.id,
    name: member.name,
    position: member.position || '',
    patternId: member.pattern,
    isSelf: member.isSelf
  }
}

function onAdd() {
  editor.value = {
    mode: 'add',
    id: 'm-' + (members.value.length + 1),
    name: '',
    position: '',
    patternId: '4F',
    isSelf: false
  }
}

function onPattern(pattern: { id: string }) {
  uni.navigateTo({ url: '/pages/pattern/index?id=' + pattern.id })
}

function onNameInput(event: any) {
  if (editor.value) editor.value.name = event.detail.value
}

function onPositionInput(event: any) {
  if (editor.value) editor.value.position = event.detail.value
}

function onSave() {
  const current = editor.value
  if (!current || !canSave.value) return

  const name = current.name.trim()
  const position = current.position.trim()

  let next = members.value
  if (current.mode === 'add') {
    next = next.concat([{ id: current.id, name, position, pattern: current.patternId, isSelf: current.isSelf, initial: name.slice(0, 1) }])
  } else {
    next = next.map(member => member.id === current.id
      ? { ...member, name, position, pattern: current.patternId, isSelf: current.isSelf, initial: name.slice(0, 1) }
      : member)
  }

  // 本人只能有一个：设了新的，其余全部取消
  if (current.isSelf) {
    next = next.map(member => ({ ...member, isSelf: member.id === current.id }))
  }

  members.value = next
  editor.value = null
}

function onDelete() {
  if (!canDelete.value || !editor.value) return
  const id = editor.value.id
  members.value = members.value.filter(member => member.id !== id)
  editor.value = null
}

function onClose() {
  editor.value = null
}

/** 抽屉内部的空点击：挡住遮罩的关闭动作 */
function onStop() {}
</script>

<style lang="scss">
/* 人员配置整页就是纸 */
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

/* ------------------------------------------------------------ 分段
 * 胶囊：浅底槽 + 选中白块浮起。两端方框更像筛选器，不像「切换视图」 */

.seg {
  display: flex;
  gap: 4rpx;
  margin: var(--gap-md) 0 var(--gap-sm);
  padding: 4rpx;
  border-radius: 999rpx;
  background: var(--surface-sunken);
}

.seg-item {
  flex: 1 1 0;
  height: 64rpx;
  line-height: 64rpx;
  text-align: center;
  border-radius: 999rpx;
  color: var(--muted);
  font-size: var(--fs-meta);
}

.seg-item.is-on {
  background: var(--surface);
  border: 1px solid var(--rule);
  box-sizing: border-box;
  color: var(--text);
  font-weight: 600;
}

/* ------------------------------------------------------------ 列表 */

.list {
  padding-bottom: var(--gap-lg);
}

.row {
  min-height: 116rpx;
  padding: var(--gap-sm) var(--gap-xs) var(--gap-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
  border-bottom: 2rpx solid var(--rule);
}

.list .row:last-child {
  border-bottom: 0;
}

.row:active {
  background: var(--surface-sunken);
}

/* 姓氏印：方形描边 + 衬线字，与「历书」的方印语言一致 */
.avatar {
  flex: 0 0 auto;
  width: 68rpx;
  height: 68rpx;
  border: 1px solid var(--border-strong);
  border-radius: 2rpx;
  color: var(--text);
  font-family: var(--font-brand);
  font-size: var(--fs-section);
  line-height: 68rpx;
  text-align: center;
}

.row-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  min-width: 0;
}

.row-line {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.row-title {
  font-size: var(--fs-body);
  font-weight: 600;
  line-height: 1.3;
}

/* 「内置 / 自定义」做成一枚描边小标签 */
.row-tag {
  padding: 0 8rpx;
  height: 28rpx;
  line-height: 26rpx;
  border: 1px solid var(--rule);
  border-radius: 2rpx;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
}

.row-sub {
  color: var(--faint);
  font-size: var(--fs-micro);
  line-height: 1.3;
}

/* 24 段缩略色条 */
.bars {
  display: flex;
  gap: 2rpx;
  margin-top: 8rpx;
}

.bar {
  width: 6rpx;
  height: 18rpx;
  border-radius: 2rpx;
}

.row-note {
  flex: 0 0 auto;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
}

.row-arrow {
  flex: 0 0 auto;
  color: var(--control);
  font-size: var(--fs-body);
  line-height: 1;
}

.badge {
  padding: 0 6rpx;
  height: 28rpx;
  line-height: 26rpx;
  border: 1px solid var(--accent);
  border-radius: 2rpx;
  color: var(--accent);
  font-size: var(--fs-micro);
  font-weight: 600;
}

/* 添加类动作专用：虚线框，不用实心按钮 —— 它不是这一屏的主操作 */
.add-btn {
  margin-top: var(--gap-md);
  height: 88rpx;
  line-height: 84rpx;
  text-align: center;
  border: 2rpx dashed var(--border);
  box-sizing: border-box;
  border-radius: var(--radius-block);
  color: var(--muted);
  font-size: var(--fs-meta);
}

.add-btn:active {
  background: var(--surface-sunken);
}

/* ------------------------------------------------------------ 抽屉 */

.backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  background: rgba(15, 20, 24, 0.26);
}

.sheet {
  width: 100%;
  padding: var(--gap-md);
  padding-bottom: calc(var(--gap-md) + 14px);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  max-height: 88vh;
  overflow-y: auto;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--gap-sm);
  border-bottom: 2rpx solid var(--rule);
}

.sheet-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.sheet-close {
  padding: 4rpx 8rpx;
  color: var(--muted);
  font-size: var(--fs-meta);
}

.field {
  margin-top: var(--gap-md);
}

.field-label {
  display: block;
  margin-bottom: var(--gap-xs);
  color: var(--muted);
  font-size: var(--fs-meta);
}

.input {
  width: 100%;
  height: 80rpx;
  padding: 0 var(--gap-sm);
  border: 2rpx solid var(--border);
  box-sizing: border-box;
  border-radius: var(--radius-control);
  font-size: var(--fs-body);
}

/* 班序胶囊：横向滚动，13 条内置 + 自定义一屏放不下 */
.chips {
  white-space: nowrap;
}

.chip {
  display: inline-block;
  height: 64rpx;
  line-height: 60rpx;
  padding: 0 var(--gap-md);
  margin-right: var(--gap-xs);
  border: 1px solid var(--border);
  box-sizing: border-box;
  border-radius: var(--radius-sub);
  color: var(--muted);
  font-size: var(--fs-meta);
}

.chip.is-on {
  border-color: var(--accent);
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 600;
}

.switch-row {
  margin-top: var(--gap-lg);
  padding: var(--gap-sm) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.switch-text {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

.switch-label {
  font-size: var(--fs-body);
}

.switch-note {
  color: var(--faint);
  font-size: var(--fs-micro);
}

/* 开关是形态复刻：78 × 46，圆角 999 */
.switch {
  width: 78rpx;
  height: 46rpx;
  padding: 4rpx;
  box-sizing: border-box;
  border-radius: 999rpx;
  background: var(--control-soft);
  transition: background var(--dur-fast) ease;
}

.switch.is-on {
  background: var(--accent);
}

.knob {
  width: 38rpx;
  height: 38rpx;
  border-radius: 999rpx;
  background: var(--surface);
  transition: transform var(--dur-fast) ease;
}

.switch.is-on .knob {
  transform: translateX(32rpx);
}

/* ------------------------------------------------------------ 底栏 */

.sheet-foot {
  margin-top: var(--gap-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-sm);
}

.foot-actions {
  display: flex;
  gap: var(--gap-xs);
}

.btn {
  height: 72rpx;
  padding: 0 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid var(--control);
  box-sizing: border-box;
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-control);
  font-weight: 600;
}

.btn-primary {
  border-color: var(--text);
  background: var(--text);
  color: var(--text-inverse);
}

.btn-danger {
  padding: 0 8rpx;
  color: var(--danger);
  font-size: var(--fs-control);
}

.is-disabled {
  opacity: 0.45;
}
</style>
