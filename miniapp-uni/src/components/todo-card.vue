<template>
  <view class="todo-card">
    <view class="todo-card-head">
      <text class="todo-card-title">待办</text>
      <text class="todo-card-stat">{{ summary.total > 0 ? `${summary.total} 项 · ${summary.pending} 项未完成` : '本月暂无' }}</text>
    </view>

    <view v-if="groups.length === 0" class="todo-empty">
      这个月还没有待办。
    </view>

    <scroll-view v-else scroll-y class="todo-scroll" :style="{ maxHeight: maxHeight + 'px' }">
      <view v-for="group in groups" :key="group.date" class="todo-group">
        <view class="todo-group-date">
          <text class="todo-group-day">{{ formatMonthDay(group.date) }}</text>
          <text class="todo-group-week">周{{ weekdayLabel(group.date) }}</text>
        </view>
        <view class="todo-items">
          <view
            v-for="todo in group.todos"
            :key="todo.id"
            class="todo-item"
            :class="[`todo-tone-${todo.tone}`, todo.done ? 'is-done' : '']"
          >
            <view class="todo-toggle" @tap.stop="$emit('toggle', todo.id)">
              <view class="todo-check" :class="{ 'is-done': todo.done }">
                <view v-if="todo.done" class="check-tick"></view>
              </view>
            </view>
            <text class="todo-text">{{ todo.text }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { groupTodosByDate, summarizeTodos, type Todo } from '../data/todos'

const props = defineProps<{ todos: Todo[]; maxHeight: number }>()
defineEmits<{ (event: 'toggle', id: string): void }>()

const groups = computed(() => groupTodosByDate(props.todos))
const summary = computed(() => summarizeTodos(props.todos))
</script>

<style lang="scss" scoped>
/* 与桌面 `todos.scss` + `≤639` 档 1:1 */
.todo-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-panel);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
  overflow: hidden;
}

.todo-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--rule);
}

.todo-card-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.todo-card-stat {
  color: var(--muted);
  font-size: var(--fs-small);
  white-space: nowrap;
}

.todo-empty {
  padding: var(--sp-4) var(--sp-3);
  border-radius: var(--radius-panel);
  background: var(--surface-sunken);
  color: var(--muted);
  font-size: var(--fs-small);
  line-height: 1.7;
  text-align: center;
}

.todo-group + .todo-group {
  margin-top: var(--sp-4);
}

.todo-group-date {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
  font-size: var(--fs-label);
  font-variant-numeric: tabular-nums;
}

.todo-group-day {
  color: var(--text);
  font-weight: 500;
}

.todo-group-week {
  color: var(--faint);
}

.todo-items {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 5px 8px;
  border-radius: var(--radius-control);
  background: var(--todo-bg, transparent);
  color: var(--todo-ink, var(--text));
  font-size: var(--fs-control);
  line-height: 1.5;
}

/* 点击热区 24px（视觉方块 14px 居中），负边距抵消放大的占位，行高不变 */
.todo-toggle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: -2px 0 0 -4px;
}

/* 圆角矩形：未完成是白底细边，完成是实心青 + 白色勾 */
.todo-check {
  position: relative;
  width: 16px;
  height: 16px;
  border: 1px solid var(--control);
  border-radius: var(--radius-mark);
  background: var(--surface);
  box-sizing: border-box;
}

.todo-check.is-done {
  border-color: var(--accent);
  background: var(--accent);
}

/* 勾：宽 7 高 3.5、线宽 2。
 * translate(-50%, -50%) 让勾的几何中心落在方块中心，再上移 0.5px ——
 * L 形的拐角在左下，旋转后视觉重心天然偏下，不补这半像素看着就「沉」。 */
.check-tick {
  position: absolute;
  top: calc(50% - 0.5px);
  left: 50%;
  width: 7px;
  height: 3.5px;
  border-bottom: 2px solid var(--text-inverse);
  border-left: 2px solid var(--text-inverse);
  border-radius: 1px;
  transform: translate(-50%, -50%) rotate(-45deg);
}

.todo-text {
  min-width: 0;
  word-break: break-word;
}

.todo-item.is-done .todo-text {
  color: var(--todo-ink, var(--faint));
  opacity: 0.55;
  text-decoration: line-through;
}
</style>
