<template>
  <view class="backdrop" @tap="requestClose">
    <view class="dialog" @tap.stop>
      <view class="dialog-head">
        <view class="dialog-head-main">
          <text class="dialog-title">{{ memberName }}</text>
          <text class="dialog-sub">{{ headSub }}</text>
        </view>
        <view class="dialog-close" @tap="requestClose">关闭</view>
      </view>

      <!-- 个人日历：班次 / 待办 两个页签 -->
      <view v-if="mode === 'day'" class="tabs">
        <view class="tab" :class="{ 'is-on': tab === 'shift' }" @tap="tab = 'shift'">班次</view>
        <view class="tab" :class="{ 'is-on': tab === 'todo' }" @tap="tab = 'todo'">
          <text>待办</text>
          <text v-if="todos.length > 0" class="tab-count">{{ todos.length }}</text>
        </view>
      </view>

      <view class="dialog-body">
        <!-- 待办页：改动立即生效 -->
        <template v-if="mode === 'day' && tab === 'todo'">
          <view class="todo-add">
            <input
              class="input"
              :value="todoText"
              :maxlength="MAX_TODO_TEXT"
              placeholder="写点什么…"
              confirm-type="done"
              @input="onTodoInput"
              @confirm="submitTodo"
            />
            <view
              class="btn btn-primary"
              :class="{ 'is-disabled': !todoText.trim() }"
              @tap="submitTodo"
            >添加</view>
          </view>

          <text v-if="todos.length === 0" class="empty-note">这一天还没有待办。</text>
          <view v-else class="todo-list">
            <view
              v-for="todo in todos"
              :key="todo.id"
              class="todo-item"
              :class="['todo-tone-' + todo.tone, { 'is-done': todo.done }]"
            >
              <view class="todo-check" @tap="onToggleTodo(todo.id)"></view>
              <text class="todo-text" @tap="onToggleTodo(todo.id)">{{ todo.text }}</text>
              <text class="todo-remove" @tap="onRemoveTodo(todo.id)">×</text>
            </view>
          </view>
        </template>

        <!-- 班次页：班次 + 加班 + 法定 + 事假时长（矩阵只能改班次） -->
        <template v-else>
          <view class="options">
            <view
              v-for="option in shiftOptions"
              :key="option.shift"
              class="option"
              :class="['t-' + option.tone, {
                'is-on': selected === option.shift,
                'is-blocked': option.blocked
              }]"
              @tap="pickShift(option.shift)"
            >
              <text>{{ option.label }}</text>
              <text v-if="selected === option.shift" class="option-check">✓</text>
            </view>
          </view>

          <!-- 矩阵只改班次：提示会连带清掉的加班 / 法定 -->
          <view v-if="mode === 'shift' && willClearExtra" class="warn">
            这天有 {{ extraText }} 记录，改为「{{ SHIFT_META[selected].label }}」会一并清除。加班请在「月度概览」的日历里录入。
          </view>

          <template v-if="mode === 'day'">
            <view v-if="selected === '事假'" class="section">
              <view class="section-head">
                <text class="section-title">事假时长</text>
                <text class="section-note">按 {{ leaveHours }} 小时从工资里扣</text>
              </view>
              <view class="segmented segmented-sm">
                <view
                  v-for="duration in LEAVE_DURATIONS"
                  :key="duration"
                  class="segmented-item"
                  :class="{ 'is-on': leave === duration }"
                  @tap="leave = duration"
                >{{ duration }}</view>
              </view>
            </view>

            <view v-if="selected === '事假'" class="section">
              <view class="section-head"><text class="section-title">加班与法定</text></view>
              <text class="section-note is-body">事假不记加班，也不参与法定节假日加班费计算。</text>
            </view>

            <view v-if="selected !== '事假'" class="section" :class="{ 'is-disabled': !overtimeAllowed }">
              <view class="section-head">
                <text class="section-title">加班</text>
                <text v-if="!overtimeAllowed" class="section-note">休息与事假不记加班</text>
                <text v-else-if="missingOvertime" class="section-note">特勤必须记录加班</text>
              </view>
              <view class="ot-row">
                <view class="ot-presets">
                  <view
                    v-for="hours in presets"
                    :key="hours"
                    class="chip-mini"
                    :class="{ 'is-on': overtimeHours === hours }"
                    @tap="pickPreset(hours)"
                  >{{ formatOvertimeHours(hours) }}</view>
                  <text v-if="presets.length === 0" class="ot-empty">—</text>
                </view>
                <view class="ot-input">
                  <input
                    class="input input-compact"
                    type="digit"
                    :value="overtimeText"
                    :disabled="!overtimeAllowed"
                    @input="onOvertimeInput"
                  />
                  <text class="ot-unit">小时</text>
                </view>
              </view>
            </view>

            <view v-if="selected !== '事假'" class="section" :class="{ 'is-disabled': !legalAllowed }">
              <view class="section-head"><text class="section-title">法定节假日</text></view>
              <view class="segmented segmented-sm">
                <view
                  class="segmented-item"
                  :class="{ 'is-on': !(legalAllowed && legal) }"
                  @tap="pickLegal(false)"
                >否</view>
                <view
                  class="segmented-item"
                  :class="{ 'is-on': legalAllowed && legal }"
                  @tap="pickLegal(true)"
                >是</view>
              </view>
            </view>
          </template>
        </template>
      </view>

      <view class="dialog-foot">
        <template v-if="confirmDiscard">
          <text class="discard-text">有未保存的修改</text>
          <view class="foot-actions">
            <view class="btn" @tap="confirmDiscard = false">继续编辑</view>
            <view class="btn btn-danger" @tap="close">放弃修改</view>
          </view>
        </template>
        <template v-else-if="mode === 'day' && tab === 'todo'">
          <view class="foot-actions is-end">
            <view class="btn" @tap="close">完成</view>
          </view>
        </template>
        <template v-else>
          <view
            class="btn btn-quiet"
            :class="{ 'is-disabled': !hasRecord }"
            @tap="restore"
          >恢复默认</view>
          <view class="foot-actions">
            <view class="btn" @tap="requestClose">取消</view>
            <view
              class="btn btn-primary"
              :class="{ 'is-disabled': !canSave }"
              @tap="save"
            >保存</view>
          </view>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { rosterStore } from '../store/roster'
import {
  findMember,
  getTemplateShift,
  overrideKey,
  getRecordMap
} from '../data/roster'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { SHIFT_META, SHIFT_TYPES, type ShiftType } from '../data/shifts'
import {
  canMarkLegal,
  canRecordOvertime,
  formatOvertimeHours,
  getOvertimePresets,
  normalizeOvertimeHours
} from '../data/overtime'
import {
  DEFAULT_LEAVE_DURATION,
  LEAVE_DURATIONS,
  leaveHoursOf,
  type LeaveDuration
} from '../data/leave'
import { MAX_TODO_TEXT } from '../data/todos'

const props = withDefaults(defineProps<{
  memberId: string
  date: string
  /** day = 个人日历（含加班/法定/事假/待办）；shift = 矩阵只改班次 */
  mode?: 'day' | 'shift'
}>(), {
  mode: 'day'
})

const emit = defineEmits<{ (event: 'close'): void }>()

const store = rosterStore
const roster = computed(() => store.state.roster)
const member = computed(() => findMember(roster.value, props.memberId))
const memberName = computed(() => member.value?.name ?? '成员')

const template = computed(() => (
  member.value ? getTemplateShift(roster.value, member.value, props.date) : null
))
const record = computed(() => {
  const map = getRecordMap(roster.value)
  return map.get(overrideKey(props.memberId, props.date))
})

/** 打开那一刻的现状：弹层挂着时不再跟随外部数据变化 */
const originalShift = record.value?.shift ?? template.value ?? '休息'
const originOvertime = record.value?.overtimeHours ?? 0
const originLegal = record.value?.isLegal === true
const originLeave: LeaveDuration = record.value?.leaveDuration ?? DEFAULT_LEAVE_DURATION
const hasRecord = Boolean(record.value)

const selected = ref<ShiftType>(originalShift)
const overtimeText = ref(originOvertime > 0 ? String(originOvertime) : '')
const legal = ref(originLegal)
const leave = ref<LeaveDuration>(originLeave)
const tab = ref<'shift' | 'todo'>('shift')
const confirmDiscard = ref(false)
const todoText = ref('')

const headSub = computed(() => {
  const base = `${formatMonthDay(props.date)} · 周${weekdayLabel(props.date)}`
  const label = template.value ? SHIFT_META[template.value].label : '—'
  return `${base} · ${props.mode === 'shift' ? '模板' : '默认'} ${label}`
})

const shiftOptions = SHIFT_TYPES.map(shift => ({
  shift,
  label: SHIFT_META[shift].label,
  tone: SHIFT_META[shift].tone,
  /* 默认班次是休息的日子不存在「请假」这回事 */
  blocked: false
})).map(option => ({
  ...option,
  blocked: option.shift === '事假' && template.value === '休息'
}))

const overtimeAllowed = computed(() => canRecordOvertime(selected.value))
const legalAllowed = computed(() => canMarkLegal(selected.value))
const overtimeHours = computed(() => (
  overtimeAllowed.value ? normalizeOvertimeHours(overtimeText.value) : 0
))
const missingOvertime = computed(() => (
  selected.value === '白特' || selected.value === '夜特'
) && overtimeHours.value <= 0)
const presets = computed(() => getOvertimePresets(selected.value, legalAllowed.value && legal.value))
const leaveHours = computed(() => leaveHoursOf(leave.value))

const extraText = computed(() => [
  originOvertime > 0 ? `+${formatOvertimeHours(originOvertime)} 加班` : '',
  originLegal ? '法定' : ''
].filter(Boolean).join('、'))

const willClearExtra = computed(() => Boolean(
  extraText.value
  && !canRecordOvertime(selected.value)
  && (originOvertime > 0 || originLegal)
))

const dirty = computed(() => {
  const currentLeave = selected.value === '事假' ? leave.value : DEFAULT_LEAVE_DURATION
  return selected.value !== originalShift
    || overtimeHours.value !== originOvertime
    || (legalAllowed.value && legal.value) !== originLegal
    || currentLeave !== originLeave
})

const canSave = computed(() => dirty.value && !missingOvertime.value)

const todos = computed(() => (
  roster.value.todos.filter(todo => todo.date === props.date)
))

function pickShift(shift: ShiftType) {
  if (shift === '事假' && template.value === '休息') {
    uni.showToast({ title: '默认班次是休息，不能请事假', icon: 'none' })
    return
  }
  selected.value = shift
  // 两条规则分开清：休息能标法定，但记不了加班
  if (!canRecordOvertime(shift)) overtimeText.value = ''
  if (!canMarkLegal(shift)) legal.value = false
}

function pickLegal(value: boolean) {
  if (!legalAllowed.value) return
  legal.value = value
}

function onOvertimeInput(event: any) {
  if (!overtimeAllowed.value) return
  overtimeText.value = event.detail.value
}

function pickPreset(hours: number) {
  if (!overtimeAllowed.value) return
  overtimeText.value = overtimeHours.value === hours ? '' : String(hours)
}

function requestClose() {
  if (props.mode === 'day' && tab.value === 'todo') {
    close()
    return
  }
  if (dirty.value) {
    confirmDiscard.value = true
    return
  }
  close()
}

function close() {
  emit('close')
}

function save() {
  if (!canSave.value) return

  if (props.mode === 'shift') {
    store.editShift(props.memberId, props.date, selected.value)
    close()
    return
  }

  store.saveDay(props.memberId, props.date, {
    shift: selected.value,
    overtimeHours: overtimeAllowed.value && overtimeHours.value > 0 ? overtimeHours.value : undefined,
    isLegal: legalAllowed.value && legal.value ? true : undefined,
    leaveDuration: selected.value === '事假' ? leave.value : undefined
  })
  close()
}

function restore() {
  if (!hasRecord) return
  if (props.mode === 'shift') {
    store.editShift(props.memberId, props.date, null)
  } else {
    store.resetDay(props.memberId, props.date)
  }
  close()
}

/* ------------------------------------------------------------ 待办 */

function onTodoInput(event: any) {
  todoText.value = event.detail.value
}

function submitTodo() {
  const body = todoText.value.trim()
  if (!body) return
  store.addTodo(props.date, body)
  todoText.value = ''
}

function onToggleTodo(id: string) {
  store.toggleTodo(id)
}

function onRemoveTodo(id: string) {
  store.removeTodo(id)
}
</script>

<style lang="scss" scoped>
/* 桌面 `DayEditor` / `ShiftEditor` 的 ≤639 档：贴底抽屉 + 六格班次 + 三张卡 */
.backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  background: rgba(15, 20, 24, 0.26);
}

.dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 88vh;
  overflow: hidden;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--rule);
}

.dialog-head-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dialog-title {
  color: var(--text);
  font-size: var(--fs-section);
  font-weight: 600;
}

.dialog-sub {
  margin-top: 2px;
  color: var(--muted);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}

.dialog-close {
  flex: 0 0 auto;
  padding: 4px 6px;
  color: var(--muted);
  font-size: var(--fs-small);
}

/* 两个页签：等宽胶囊，选中白块 */
.tabs {
  display: flex;
  gap: 4px;
  margin: var(--sp-3) var(--sp-3) 0;
  padding: 3px;
  border-radius: var(--radius-control);
  background: var(--surface-sunken);
}

.tab {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  border-radius: var(--radius-sub);
  color: var(--muted);
  font-size: var(--fs-small);
}

.tab.is-on {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(19, 20, 22, 0.06);
}

.tab-count {
  color: var(--faint);
  font-size: var(--fs-micro);
}

.dialog-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 0;
  padding: var(--sp-3);
  overflow-y: auto;
}

/* 六格班次：3 × 2，42px 高 */
.options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  font-size: var(--fs-body);
  font-weight: 500;
}

.option.is-on {
  border-color: var(--text);
}

.option.is-blocked {
  border-color: var(--border);
  background: var(--raised);
  color: var(--faint);
}

.option-check {
  position: absolute;
  top: 4px;
  right: 7px;
  font-size: var(--fs-label);
  line-height: 1;
}

/* 「改班会清掉加班」提示 */
.warn {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-control);
  background: var(--warning-bg);
  box-shadow: inset 0 0 0 1px var(--warning-border);
  color: var(--warning-ink);
  font-size: var(--fs-small);
  line-height: 1.6;
}

/* 三张卡：浅底 + 1px 边，手机上高度随内容 */
.section {
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--ground);
}

.section.is-disabled {
  opacity: 0.55;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.section-title {
  font-size: var(--fs-small);
  font-weight: 600;
}

.section-note {
  color: var(--muted);
  font-size: var(--fs-label);
}

.section-note.is-body {
  display: block;
  line-height: 1.6;
}

.ot-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.ot-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--control);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}

.chip-mini.is-on {
  border-color: var(--accent);
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 600;
}

.ot-empty {
  color: var(--muted);
  font-size: var(--fs-small);
}

.ot-input {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.ot-input .input {
  width: 84px;
}

.ot-unit {
  color: var(--muted);
  font-size: var(--fs-small);
}

.segmented-sm .segmented-item {
  height: 26px;
  padding: 0 14px;
}

/* 待办 */
.todo-add {
  display: flex;
  gap: var(--sp-2);
}

.todo-add .input {
  flex: 1 1 auto;
  min-width: 0;
}

.empty-note {
  padding: 16px 0;
  color: var(--muted);
  font-size: var(--fs-control);
  text-align: center;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px 8px;
  border-radius: var(--radius-control);
  background: var(--todo-bg);
}

.todo-check {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: 1px solid var(--todo-ink);
  border-radius: var(--radius-mark);
}

.todo-item.is-done .todo-check {
  background: var(--todo-ink);
}

.todo-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--todo-ink);
  font-size: var(--fs-control);
  line-height: 1.4;
}

.todo-item.is-done .todo-text {
  opacity: 0.6;
  text-decoration: line-through;
}

.todo-remove {
  flex: 0 0 auto;
  padding: 0 4px;
  color: var(--todo-ink);
  font-size: var(--fs-body);
  line-height: 1;
}

/* 底栏 */
.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3) calc(var(--sp-3) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--rule);
}

.discard-text {
  color: var(--warning-ink);
  font-size: var(--fs-small);
}

.foot-actions {
  display: flex;
  gap: 8px;
}

.foot-actions.is-end {
  margin-left: auto;
}

.is-disabled {
  opacity: 0.45;
}
</style>
