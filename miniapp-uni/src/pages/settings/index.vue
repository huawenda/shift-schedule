<template>
  <nav-bar />

  <view
    class="page"
    :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: pageBottom + 'px' }"
  >
    <view class="canvas">
      <view class="canvas-head" :style="{ top: frame.navHeight + 'px' }">
        <view class="head-bar">
          <text class="canvas-title">设置</text>
          <view class="canvas-tools">
            <view class="segmented">
              <view
                class="segmented-item"
                :class="{ 'is-on': tab === 'roster' }"
                @tap="switchTab('roster')"
              >人员配置</view>
              <view
                class="segmented-item"
                :class="{ 'is-on': tab === 'profile' }"
                @tap="switchTab('profile')"
              >个人资料</view>
            </view>
          </view>
        </view>
        <text class="canvas-sub">{{ tabSub }}</text>
      </view>

      <!-- ------------------------------------------------------------ 人员配置 -->
      <template v-if="tab === 'roster'">
        <view class="settings-section">
          <view class="settings-label">
            <view class="label-head">
              <view class="label-mark"></view>
              <text class="label-title">班序</text>
            </view>
            <text class="settings-p">班序是 {{ CYCLE_LENGTH }} 天一轮的循环，锚点日 {{ ANCHOR_DATE }}。</text>
            <text class="settings-p">内置 {{ builtin.length }} 条只读；自建的最多 {{ MAX_CUSTOM }} 条，可改可删。</text>
          </view>

          <view class="settings-panel">
            <view class="pattern-group">
              <text class="pattern-group-label">内置 {{ builtin.length }} 条 · 只读</text>
              <view class="pattern-chips">
                <view
                  v-for="pattern in builtin"
                  :key="pattern.id"
                  class="pattern-chip"
                  :class="{ 'is-on': builtinPreviewId === pattern.id }"
                  @tap="toggleBuiltin(pattern.id)"
                >
                  <text class="pattern-chip-name">{{ pattern.name }}</text>
                  <view class="pattern-bar">
                    <view
                      v-for="(tone, index) in pattern.tones"
                      :key="index"
                      class="pattern-bar-seg"
                      :class="'t-' + tone"
                    ></view>
                  </view>
                </view>
              </view>
            </view>

            <view v-if="builtinPreview" class="pattern-preview">
              <view class="pattern-preview-head">
                <text class="pattern-preview-title">{{ builtinPreview.name }}</text>
              </view>
              <pattern-grid :shifts="builtinPreview.shifts" readonly />
            </view>

            <view class="pattern-group">
              <view class="pattern-group-label">
                <text>自建班序 {{ custom.length }} / {{ MAX_CUSTOM }}</text>
                <text v-if="atLimit" class="pattern-group-note">已达上限，删掉一条才能再加</text>
              </view>

              <text v-if="custom.length === 0" class="pattern-empty">还没有自建班序</text>

              <view v-else class="pattern-rows">
                <view v-for="pattern in custom" :key="pattern.id" class="pattern-item">
                  <view class="pattern-row" :class="{ 'is-open': customPreviewId === pattern.id }">
                    <view class="pattern-row-head">
                      <text class="pattern-row-name">{{ pattern.name }}</text>
                      <text class="pattern-row-usage">{{ pattern.usersText }}</text>
                    </view>
                    <view class="pattern-bar">
                      <view
                        v-for="(tone, index) in pattern.tones"
                        :key="index"
                        class="pattern-bar-seg"
                        :class="'t-' + tone"
                      ></view>
                    </view>
                    <view class="pattern-row-actions">
                      <view class="btn btn-quiet" @tap="toggleCustom(pattern.id)">
                        {{ customPreviewId === pattern.id ? '收起' : '查看' }}
                      </view>
                      <view class="btn btn-quiet" @tap="openPatternEditor(pattern)">编辑</view>
                      <view
                        class="btn btn-quiet"
                        :class="{ 'is-disabled': pattern.id === selfPatternId }"
                        @tap="startDelete(pattern)"
                      >删除</view>
                    </view>
                  </view>

                  <view
                    v-if="customPreviewId === pattern.id"
                    class="pattern-preview pattern-preview-inline"
                  >
                    <pattern-grid :shifts="pattern.shifts" readonly />
                  </view>
                </view>
              </view>

              <view class="btn btn-add" :class="{ 'is-disabled': atLimit }" @tap="openPatternEditor()">
                新建班序
              </view>
            </view>
          </view>
        </view>

        <view class="settings-section">
          <view class="settings-label">
            <view class="label-head">
              <view class="label-mark"></view>
              <text class="label-title">成员</text>
              <view class="label-actions">
                <view v-if="sorting" class="sort-action" @tap="finishSorting">完成</view>
                <view v-else class="sort-action" @tap="enterSorting">排序</view>
                <view v-if="sorting" class="sort-action is-quiet" @tap="cancelSorting">取消</view>
              </view>
            </view>
            <text class="settings-p">姓名自定，人数不限。</text>
            <text class="settings-p">本人行为只读，请在「个人资料」页修改。</text>
            <text class="settings-meta">当前 {{ roster.members.length }} 位成员</text>
          </view>

          <view class="settings-panel">
            <view v-if="sorting" class="sort-block">
              <text class="sort-hint">按住左侧把手上下拖动；顺序就是全员矩阵的行顺序。</text>
              <view class="sort-list">
                <view
                  v-for="(row, index) in rows"
                  :key="row.key"
                  class="sort-row"
                  :class="{ 'is-self': row.id === selfId, 'is-dragging': dragIndex === index }"
                  :style="{ transform: sortTransform(index) }"
                >
                  <view
                    class="sort-handle"
                    @touchstart.stop="onSortStart(index, $event)"
                    @touchmove.stop.prevent="onSortMove($event)"
                    @touchend.stop="onSortEnd"
                    @touchcancel.stop="onSortEnd"
                  >⠿</view>
                  <text class="sort-name">{{ row.name }}</text>
                  <text v-if="row.id === selfId" class="badge-self">本人</text>
                  <text class="sort-meta">{{ sortMeta(row) }}</text>
                </view>
              </view>
            </view>

            <view v-else class="member-editor">
              <text v-if="rows.length === 0" class="member-empty">还没有人。点下面的「添加成员」开始。</text>

              <view
                v-for="(row, index) in rows"
                :key="row.key"
                class="member-card"
                :class="{ 'is-self': row.id === selfId, 'is-invalid': Boolean(rowError(index)) }"
              >
                <view class="member-card-head">
                  <text v-if="row.id === selfId" class="member-self-name">{{ row.name }}</text>
                  <input
                    v-else
                    class="member-name-input"
                    :value="row.name"
                    maxlength="12"
                    placeholder="姓名"
                    @input="onRowInput(index, 'name', $event)"
                  />
                  <text v-if="row.id === selfId" class="badge-self">本人</text>

                  <view class="member-card-actions">
                    <view
                      class="btn-icon"
                      :class="{ 'is-disabled': index === 0 }"
                      @tap="moveRow(index, -1)"
                    >↑</view>
                    <view
                      class="btn-icon"
                      :class="{ 'is-disabled': index === rows.length - 1 }"
                      @tap="moveRow(index, 1)"
                    >↓</view>
                    <view
                      v-if="row.id !== selfId"
                      class="member-remove"
                      @tap="removeRow(index)"
                    >删除</view>
                  </view>
                </view>

                <view class="member-card-fields">
                  <view v-if="row.id === selfId" class="member-locked">{{ patternLabel(row.patternId) }}</view>
                  <view
                    v-else
                    class="input member-pattern is-select"
                    @tap="openPatternPicker(index)"
                  >
                    <text class="select-text">{{ patternLabel(row.patternId) }}</text>
                    <text class="select-caret">⌄</text>
                  </view>

                  <view v-if="row.id === selfId" class="member-locked">{{ row.position || '—' }}</view>
                  <input
                    v-else
                    class="input member-position"
                    :value="row.position"
                    maxlength="12"
                    placeholder="岗位（可选）"
                    @input="onRowInput(index, 'position', $event)"
                  />
                </view>

                <text v-if="rowError(index)" class="member-card-error">{{ rowError(index) }}</text>
              </view>

              <view class="btn btn-add" @tap="addRow">添加成员</view>
            </view>
          </view>
        </view>
      </template>

      <!-- ------------------------------------------------------------ 个人资料 -->
      <template v-else>
        <view class="settings-section">
          <view class="settings-label">
            <view class="label-head">
              <view class="label-mark"></view>
              <text class="label-title">本人</text>
            </view>
            <text class="settings-p">这是你自己的记录本：日历只显示本人。</text>
            <text class="settings-p">更改姓名或班序会清空本人名下的考勤记录与薪资。</text>
            <text class="settings-meta">{{ self ? `本人 ${self.name} · ${patternLabel(self.patternId)}` : '还没有设置本人' }}</text>
          </view>

          <view class="settings-panel">
            <view class="profile-form">
              <view class="field">
                <text class="field-label">姓名</text>
                <input
                  class="input"
                  :value="selfDraft.name"
                  maxlength="12"
                  placeholder="你的姓名"
                  @input="onSelfName"
                />
              </view>

              <view class="field">
                <text class="field-label">班序</text>
                <view class="input is-select" @tap="openSelfPatternPicker">
                  <text class="select-text">{{ patternLabel(selfDraft.patternId) }}</text>
                  <text class="select-caret">⌄</text>
                </view>
              </view>

              <view class="field">
                <text class="field-label">岗位</text>
                <input
                  class="input"
                  :value="selfDraft.position"
                  maxlength="12"
                  placeholder="岗位（可选）"
                  @input="onSelfPosition"
                />
              </view>
            </view>

            <view v-if="selfErrors.length > 0" class="error-list">
              <text v-for="error in selfErrors" :key="error" class="error-item">{{ error }}</text>
            </view>

            <view class="settings-actions">
              <view
                class="btn btn-primary"
                :class="{ 'is-disabled': !identityDirty }"
                @tap="submitIdentity"
              >{{ self ? '保存本人信息' : '设为本人' }}</view>
              <text v-if="!self" class="settings-hint">设置后个人日历只显示你本人。</text>
            </view>
          </view>
        </view>

        <view class="settings-section">
          <view class="settings-label">
            <view class="label-head">
              <view class="label-mark"></view>
              <text class="label-title">薪资</text>
            </view>
            <text class="settings-p">每月固定的基线，用来算时薪、加班费与实发。</text>
          </view>

          <view class="settings-panel">
            <text v-if="!self" class="settings-hint">先设置本人，才能填薪资。</text>

            <view class="salary-grid">
              <view v-for="field in SALARY_FIELDS" :key="field.key" class="field">
                <text class="field-label">{{ field.label }}</text>
                <view class="money-input">
                  <input
                    class="input money-field"
                    :class="{ 'is-locked': !self }"
                    type="digit"
                    :value="salaryDraft[field.key]"
                    placeholder="0.00"
                    @input="onSalaryInput(field.key, $event)"
                  />
                  <text class="money-unit">元</text>
                </view>
              </view>
            </view>

            <view class="settings-actions">
              <view
                class="btn btn-primary"
                :class="{ 'is-disabled': !self || !salaryDirty }"
                @tap="submitSalary"
              >保存薪资</view>
            </view>
          </view>
        </view>

        <view class="settings-section">
          <view class="settings-label">
            <view class="label-head">
              <view class="label-mark"></view>
              <text class="label-title">备份</text>
            </view>
            <text class="settings-p">数据只保存在这台手机的这个小程序里。换手机、清理小程序数据前，请先导出。</text>
            <text class="settings-meta">当前 {{ roster.members.length }} 位成员 · {{ roster.overrides.length }} 条改班记录</text>
          </view>

          <view class="settings-panel">
            <view class="settings-actions">
              <view class="btn" @tap="onExport">导出备份</view>
              <view class="btn" @tap="onImport">导入备份</view>
            </view>
            <text class="settings-hint">导出的是一段 JSON 文本（复制到剪贴板）；导入会整体覆盖当前数据，含个人信息。</text>
          </view>
        </view>

        <view class="settings-section">
          <view class="settings-label">
            <view class="label-head">
              <view class="label-mark is-danger"></view>
              <text class="label-title">清空数据</text>
            </view>
            <text class="settings-p">删除本机保存的全部成员与改班记录，回到首次配置状态。此操作不可撤销。</text>
          </view>

          <view class="settings-panel">
            <view class="danger-row">
              <input
                class="input danger-input"
                :value="confirmText"
                placeholder="输入「清空」以确认"
                @input="onConfirmInput"
              />
              <view
                class="btn btn-danger"
                :class="{ 'is-disabled': confirmText.trim() !== '清空' }"
                @tap="onClearAll"
              >清空全部数据</view>
            </view>
          </view>
        </view>
      </template>
    </view>
  </view>

  <!-- 有未保存改动：吸附在 tabBar 上方，不用滚到页尾 -->
  <view
    v-if="tab === 'roster' && !sorting && memberDirty"
    class="save-bar"
    :style="{ bottom: frame.tabBarHeight + 'px' }"
  >
    <text class="save-bar-hint">有未保存的修改</text>
    <view
      class="btn btn-primary save-bar-btn"
      :class="{ 'is-disabled': memberErrors.length > 0 }"
      @tap="saveMembers"
    >保存成员设置</view>
  </view>

  <tab-bar :current="2" />

  <!-- ------------------------------------------------------------ 班序选择抽屉 -->
  <view v-if="picker" class="sheet-backdrop" @tap="picker = null">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <text class="sheet-title">选择班序</text>
        <view class="sheet-close" @tap="picker = null">关闭</view>
      </view>
      <view class="sheet-body">
        <view class="picker-group">
          <text class="pattern-group-label">内置 {{ builtin.length }} 条</text>
          <view class="picker-grid">
            <view
              v-for="pattern in builtin"
              :key="pattern.id"
              class="picker-chip"
              :class="{ 'is-on': picker.currentId === pattern.id }"
              @tap="choosePattern(pattern.id)"
            >{{ pattern.name }}</view>
          </view>
        </view>
        <view v-if="custom.length > 0" class="picker-group">
          <text class="pattern-group-label">自定义 {{ custom.length }} 条</text>
          <view class="picker-grid">
            <view
              v-for="pattern in custom"
              :key="pattern.id"
              class="picker-chip"
              :class="{ 'is-on': picker.currentId === pattern.id }"
              @tap="choosePattern(pattern.id)"
            >{{ pattern.name }}</view>
          </view>
        </view>
      </view>
    </view>
  </view>

  <!-- ------------------------------------------------------------ 班序编辑抽屉 -->
  <view v-if="editor" class="sheet-backdrop" @tap="closeEditor">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <view class="sheet-head-main">
          <text class="sheet-title">{{ editor.existingId ? '编辑班序' : '新建班序' }}</text>
          <text class="sheet-sub">{{ CYCLE_LENGTH }} 天一轮 · 锚点日 {{ ANCHOR_DATE }}</text>
        </view>
        <view class="sheet-close" @tap="closeEditor">关闭</view>
      </view>

      <view class="sheet-body">
        <view class="field">
          <text class="field-label">班序名称</text>
          <input
            class="input"
            :value="editor.name"
            maxlength="12"
            placeholder="比如：4A、4B、4C"
            @input="onEditorName"
          />
        </view>

        <pattern-grid :shifts="editor.shifts" :active="editor.active" @pick="pickCell" />

        <text class="editor-active">
          第 {{ editor.active + 1 }} 天 · 现在是「{{ SHIFT_META[editor.shifts[editor.active]].label }}」，点下面的班次填入，自动跳下一格
        </text>

        <view class="shift-palette">
          <view
            v-for="item in PALETTE"
            :key="item.shift"
            class="palette-option"
            :class="['t-' + item.tone, { 'is-on': editor.shifts[editor.active] === item.shift }]"
            @tap="assignShift(item.shift)"
          >{{ item.label }}</view>
        </view>

        <view v-if="editor.errors.length > 0" class="error-list">
          <text v-for="error in editor.errors" :key="error" class="error-item">{{ error }}</text>
        </view>
      </view>

      <view class="sheet-foot">
        <text class="editor-hint">自建班序第一天对应锚点日 {{ ANCHOR_DATE }} 的班次</text>
        <view class="foot-actions">
          <view class="btn" @tap="closeEditor">取消</view>
          <view class="btn btn-primary" @tap="savePattern">{{ editor.existingId ? '保存班序' : '创建班序' }}</view>
        </view>
      </view>
    </view>
  </view>

  <!-- ------------------------------------------------------------ 删除班序二次确认 -->
  <view v-if="pendingDelete" class="sheet-backdrop" @tap="pendingDelete = null">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <view class="sheet-head-main">
          <text class="sheet-title">删除班序「{{ pendingDelete.name }}」？</text>
          <text class="sheet-sub">此操作不可撤销</text>
        </view>
        <view class="sheet-close" @tap="pendingDelete = null">关闭</view>
      </view>

      <view class="sheet-body">
        <text v-if="deleteUsage.members.length === 0" class="settings-hint">目前没有成员挂在这条班序上，删除后只影响这条班序本身。</text>
        <template v-else>
          <text class="settings-hint">挂在这条班序上的 {{ deleteUsage.members.length }} 位成员会被一并删除：</text>
          <text class="confirm-names">{{ deleteUsage.members.join('、') }}</text>
          <text class="settings-hint">他们的 {{ deleteUsage.overrides }} 条改班记录也会被清理。</text>
        </template>
        <text class="settings-hint">如果只是想调整 24 格的规律，用「编辑」；只有确实不再需要这条班序时才删除。</text>

        <view class="field">
          <text class="field-label">输入「{{ pendingDelete.name }}」以确认</text>
          <input
            class="input"
            :value="deleteConfirmText"
            placeholder="班序名称"
            @input="onDeleteConfirmInput"
          />
        </view>
      </view>

      <view class="sheet-foot is-end">
        <view class="foot-actions">
          <view class="btn" @tap="pendingDelete = null">取消</view>
          <view
            class="btn btn-danger"
            :class="{ 'is-disabled': deleteConfirmText.trim() !== pendingDelete.name }"
            @tap="confirmDelete"
          >删除班序</view>
        </view>
      </view>
    </view>
  </view>

  <!-- ------------------------------------------------------------ 更换本人确认 -->
  <view v-if="pendingImpact" class="sheet-backdrop" @tap="pendingImpact = null">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <view class="sheet-head-main">
          <text class="sheet-title">更换本人？</text>
          <text class="sheet-sub">这会清空此前本人的数据，且不能撤销。</text>
        </view>
      </view>

      <view class="sheet-body">
        <view class="impact-list">
          <text v-if="pendingImpact.overrides > 0" class="impact-item">
            清空 {{ pendingImpact.overrides }} 条改班记录<text v-if="pendingImpact.overtime > 0 || pendingImpact.legal > 0">（含<text v-if="pendingImpact.overtime > 0"> {{ pendingImpact.overtime }} 条加班</text><text v-if="pendingImpact.legal > 0">{{ pendingImpact.overtime > 0 ? '、' : ' ' }}{{ pendingImpact.legal }} 条法定</text>）</text>
          </text>
          <text v-if="pendingImpact.salaryFilled > 0" class="impact-item">清空已填的 {{ pendingImpact.salaryFilled }} 项薪资</text>
          <text class="impact-item">同事的排班与记录不受影响</text>
        </view>
      </view>

      <view class="sheet-foot is-end">
        <view class="foot-actions">
          <view class="btn" @tap="pendingImpact = null">取消</view>
          <view class="btn btn-danger" @tap="confirmSwap">确认更换</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onPageScroll } from '@dcloudio/uni-app'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import PatternGrid from '../../components/pattern-grid.vue'
import { rosterStore } from '../../store/roster'
import {
  countOverrides,
  createMemberId,
  getSelf,
  patternUsage,
  selfImpact,
  validateMembers,
  validateSelf,
  type Member
} from '../../data/roster'
import {
  MAX_CUSTOM_PATTERNS,
  PATTERN_ANCHOR_DATE,
  PATTERN_CYCLE_LENGTH,
  PATTERN_SHIFT_OPTIONS,
  createBlankCustomPattern,
  createCustomPatternId,
  resolvePatterns,
  validateCustomPattern,
  type CustomPattern
} from '../../data/patterns'
import { SHIFT_META, type ShiftType } from '../../data/shifts'
import {
  SALARY_FIELDS,
  emptySalary,
  sanitizeMoneyInput,
  type SalaryInput
} from '../../data/profile'

/** 模板里直接用的常量 */
const CYCLE_LENGTH = PATTERN_CYCLE_LENGTH
const ANCHOR_DATE = PATTERN_ANCHOR_DATE
const MAX_CUSTOM = MAX_CUSTOM_PATTERNS

const store = rosterStore
const roster = computed(() => store.state.roster)
const self = computed(() => getSelf(roster.value))
const selfId = computed(() => self.value?.id ?? '')
const selfPatternId = computed(() => self.value?.patternId ?? '')
const lookup = computed(() => resolvePatterns(roster.value.patterns))

const tab = ref<'roster' | 'profile'>('roster')
const tabSub = computed(() => (
  tab.value === 'roster' ? '成员名单与矩阵行顺序' : '本人与薪资、备份、清空数据'
))

function switchTab(next: 'roster' | 'profile') {
  if (tab.value === next) return
  if (sorting.value) finishSorting()
  tab.value = next
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function patternLabel(id: string): string {
  return lookup.value.labelOf(id)
}

/* ------------------------------------------------------------ 班序 */

const builtin = computed(() => lookup.value.builtin.map(item => ({
  id: item.id,
  name: lookup.value.labelOf(item.id),
  shifts: item.shifts,
  tones: item.shifts.map(shift => SHIFT_META[shift].tone)
})))

const custom = computed(() => roster.value.patterns.map(item => {
  const users = roster.value.members.filter(member => member.patternId === item.id).length
  return {
    id: item.id,
    name: item.name,
    shifts: item.shifts,
    tones: item.shifts.map(shift => SHIFT_META[shift].tone),
    usersText: users > 0 ? `${users} 人` : '未使用'
  }
}))

const atLimit = computed(() => roster.value.patterns.length >= MAX_CUSTOM_PATTERNS)

const builtinPreviewId = ref<string | null>(null)
const customPreviewId = ref<string | null>(null)

const builtinPreview = computed(() => (
  builtin.value.find(item => item.id === builtinPreviewId.value) ?? null
))

function toggleBuiltin(id: string) {
  builtinPreviewId.value = builtinPreviewId.value === id ? null : id
}

function toggleCustom(id: string) {
  customPreviewId.value = customPreviewId.value === id ? null : id
}

/* ------------------------------------------------------------ 班序编辑抽屉 */

interface EditorState {
  /** 编辑已有班序时带上 id；null = 新建 */
  existingId: string | null
  name: string
  shifts: ShiftType[]
  active: number
  errors: string[]
}

const editor = ref<EditorState | null>(null)

function openPatternEditor(pattern?: { id: string; name: string; shifts: ShiftType[] }) {
  if (!pattern && atLimit.value) {
    toast(`自定义班序最多 ${MAX_CUSTOM} 条，删掉一条再加`)
    return
  }
  editor.value = pattern
    ? {
      existingId: pattern.id,
      name: pattern.name,
      shifts: [...pattern.shifts],
      active: 0,
      errors: []
    }
    : {
      existingId: null,
      name: '',
      // 新建初始是全休息，避免出现半张表
      shifts: [...createBlankCustomPattern().shifts],
      active: 0,
      errors: []
    }
}

function closeEditor() {
  editor.value = null
}

function onEditorName(event: any) {
  if (editor.value) {
    editor.value.name = event.detail.value
    editor.value.errors = []
  }
}

function pickCell(index: number) {
  if (editor.value) editor.value.active = index
}

function assignShift(shift: ShiftType) {
  const current = editor.value
  if (!current) return
  const shifts = current.shifts.slice()
  shifts[current.active] = shift
  current.shifts = shifts
  current.active = (current.active + 1) % CYCLE_LENGTH
  current.errors = []
}

function savePattern() {
  const current = editor.value
  if (!current) return

  const errors = validateCustomPattern(
    { id: current.existingId ?? undefined, name: current.name, shifts: current.shifts },
    roster.value.patterns
  )
  if (errors.length > 0) {
    current.errors = errors
    return
  }

  const pattern: CustomPattern = {
    id: current.existingId ?? createCustomPatternId(),
    name: current.name.trim(),
    shifts: current.shifts
  }
  store.savePattern(pattern)
  editor.value = null
  builtinPreviewId.value = null
  customPreviewId.value = pattern.id
  toast(`已保存班序「${pattern.name}」，24 格已全量生效`)
}

/* ------------------------------------------------------------ 删除班序 */

const pendingDelete = ref<CustomPattern | null>(null)
const deleteConfirmText = ref('')

const deleteUsage = computed(() => (
  pendingDelete.value
    ? patternUsage(roster.value, pendingDelete.value.id)
    : { members: [] as string[], overrides: 0 }
))

function startDelete(pattern: { id: string; name: string; shifts: ShiftType[] }) {
  if (pattern.id === selfPatternId.value) {
    toast('本人正挂在这条班序上。请先在「个人资料」里把本人换到别的班序，再来删。')
    return
  }
  pendingDelete.value = { id: pattern.id, name: pattern.name, shifts: [...pattern.shifts] }
  deleteConfirmText.value = ''
}

function onDeleteConfirmInput(event: any) {
  deleteConfirmText.value = event.detail.value
}

function confirmDelete() {
  const target = pendingDelete.value
  if (!target || deleteConfirmText.value.trim() !== target.name) return

  const usage = patternUsage(roster.value, target.id)
  const result = store.removePatternById(target.id)
  pendingDelete.value = null
  deleteConfirmText.value = ''

  if (result.blocked === 'self') {
    toast('本人正挂在这条班序上，不能删除')
    return
  }
  if (usage.members.length > 0) {
    toast(`已删除「${target.name}」，移除 ${usage.members.length} 位成员与 ${usage.overrides} 条改班记录`)
  } else {
    toast(`已删除班序「${target.name}」`)
  }
}

/* ------------------------------------------------------------ 成员草稿 */

interface Row {
  key: string
  id: string
  name: string
  patternId: string
  position: string
}

function toRows(): Row[] {
  return roster.value.members.map(member => ({
    key: member.id,
    id: member.id,
    name: member.name,
    patternId: member.patternId,
    position: member.position ?? ''
  }))
}

const rows = ref<Row[]>(toRows())
const memberDirty = ref(false)

/* ------------------------------------------------------------ 排序模式
 *
 * 点「排序」后卡片压成 44px 紧凑行，只有左侧把手能拖；
 * 其余行按固定行距让位，松手即重排 rows（顺序 = 矩阵行顺序）。
 * 排序只改本地数组，仍走「保存成员设置」落盘；取消恢复进入排序前的快照。 */
const sorting = ref(false)
const sortSnapshot = ref<Row[] | null>(null)
const dirtyBeforeSort = ref(false)
const dragIndex = ref(-1)
const dragTarget = ref(-1)
const dragOffset = ref(0)

/** 排序行高 44 + 间距 8 */
const SORT_STEP = 52
/** 每行在内容坐标系里的中心 Y */
let sortCenters: number[] = []
let sortScroll = 0
let sortMaxScroll = 0
let dragStartClientY = 0
let dragStartScroll = 0
let lastClientY = 0
let autoTimer: ReturnType<typeof setInterval> | null = null
let autoDir = 0

onPageScroll(({ scrollTop }) => {
  sortScroll = scrollTop
})

function sortMeta(row: Row): string {
  const position = row.position.trim()
  const pattern = patternLabel(row.patternId)
  return position ? `${pattern} · ${position}` : pattern
}

function enterSorting() {
  if (rows.value.length < 2) {
    toast('至少两位成员才能排序')
    return
  }
  sortSnapshot.value = rows.value.map(row => ({ ...row }))
  dirtyBeforeSort.value = memberDirty.value
  sorting.value = true
  resetDrag()
  nextTick(measureSortRows)
}

function finishSorting() {
  sorting.value = false
  stopAutoScroll()
  resetDrag()
}

function cancelSorting() {
  if (sortSnapshot.value) rows.value = sortSnapshot.value.map(row => ({ ...row }))
  memberDirty.value = dirtyBeforeSort.value
  sorting.value = false
  stopAutoScroll()
  resetDrag()
}

function resetDrag() {
  dragIndex.value = -1
  dragTarget.value = -1
  dragOffset.value = 0
}

/** 进入排序时量一次每行的中心（内容坐标）与页面可滚动上限 */
function measureSortRows() {
  const query = uni.createSelectorQuery()
  query.selectAll('.sort-row').boundingClientRect()
  query.select('.page').boundingClientRect()
  query.selectViewport().scrollOffset(() => {})
  query.exec(res => {
    const rects = (res[0] || []) as Array<{ top: number, height: number }>
    const pageRect = res[1] as { height?: number } | null
    const viewport = res[2] as { scrollTop?: number } | null
    sortScroll = viewport?.scrollTop ?? 0
    sortCenters = rects.map(rect => rect.top + sortScroll + rect.height / 2)
    sortMaxScroll = Math.max(0, (pageRect?.height ?? 0) - uni.getWindowInfo().windowHeight)
  })
}

function onSortStart(index: number, event: any) {
  if (dragIndex.value >= 0) return
  // 行矩形还在测量中：这次先不进入拖拽，量完再拖
  if (sortCenters.length !== rows.value.length) {
    measureSortRows()
    return
  }
  const touch = event.touches && event.touches[0]
  if (!touch) return
  dragIndex.value = index
  dragTarget.value = index
  dragOffset.value = 0
  dragStartClientY = touch.clientY
  dragStartScroll = sortScroll
  lastClientY = touch.clientY
  uni.vibrateShort({ type: 'light', fail: () => {} })
}

function onSortMove(event: any) {
  if (dragIndex.value < 0) return
  const touch = event.touches && event.touches[0]
  if (!touch) return
  updateDrag(touch.clientY)
}

function updateDrag(clientY: number) {
  if (sortCenters.length === 0 || dragIndex.value < 0) return
  lastClientY = clientY

  // 跟手位移先按内容坐标算出来，再夹在名单首行/末行之间 ——
  // 被拖卡只能在这张成员面板里上下走，不能拖到页头或屏幕外。
  const rawOffset = clientY - dragStartClientY + (sortScroll - dragStartScroll)
  const rawCenter = sortCenters[dragIndex.value] + rawOffset
  const minCenter = sortCenters[0]
  const maxCenter = sortCenters[sortCenters.length - 1]
  const clampedCenter = Math.min(maxCenter, Math.max(minCenter, rawCenter))
  dragOffset.value = clampedCenter - sortCenters[dragIndex.value]

  let target = dragIndex.value
  let best = Number.POSITIVE_INFINITY
  sortCenters.forEach((center, index) => {
    const distance = Math.abs(center - clampedCenter)
    if (distance < best) {
      best = distance
      target = index
    }
  })
  dragTarget.value = target

  handleAutoScroll(clientY)
}

/** 拖到上下边缘时手动滚页面：页面滚动被 catchtouchmove 拦住了 */
function handleAutoScroll(clientY: number) {
  const info = uni.getWindowInfo()
  const topEdge = frame.navHeight + 100
  const bottomEdge = info.windowHeight - frame.tabBarHeight - 90
  const dir = clientY < topEdge ? -1 : clientY > bottomEdge ? 1 : 0

  if (dir === 0) {
    stopAutoScroll()
    return
  }
  if (autoDir === dir && autoTimer) return

  stopAutoScroll()
  autoDir = dir
  autoTimer = setInterval(() => {
    const next = Math.min(sortMaxScroll, Math.max(0, sortScroll + autoDir * 8))
    if (next === sortScroll) {
      stopAutoScroll()
      return
    }
    sortScroll = next
    uni.pageScrollTo({ scrollTop: next, duration: 0 })
    updateDrag(lastClientY)
  }, 30)
}

function stopAutoScroll() {
  if (autoTimer) {
    clearInterval(autoTimer)
    autoTimer = null
  }
  autoDir = 0
}

function onSortEnd() {
  if (dragIndex.value < 0) return
  const from = dragIndex.value
  const to = dragTarget.value
  stopAutoScroll()

  if (from !== to) {
    const next = rows.value.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    rows.value = next
    memberDirty.value = true
  }
  resetDrag()
}

/** 被拖行跟手，夹在它和目标之间的行让出一条行距 */
function sortTransform(index: number): string {
  if (dragIndex.value < 0) return ''
  if (index === dragIndex.value) return `translateY(${dragOffset.value}px)`

  if (dragIndex.value < dragTarget.value && index > dragIndex.value && index <= dragTarget.value) {
    return `translateY(-${SORT_STEP}px)`
  }
  if (dragIndex.value > dragTarget.value && index >= dragTarget.value && index < dragIndex.value) {
    return `translateY(${SORT_STEP}px)`
  }
  return ''
}

watch(
  () => roster.value.members,
  () => {
    rows.value = toRows()
    memberDirty.value = false
  },
  { deep: true }
)

function memberDrafts(): Member[] {
  return rows.value
    .filter(row => row.name.trim())
    .map(row => {
      const position = row.position.trim()
      return {
        id: row.id,
        name: row.name.trim(),
        patternId: row.patternId,
        ...(position ? { position } : {})
      }
    })
}

const memberErrors = computed(() => (
  rows.value.length === 0
    ? []
    : validateMembers(memberDrafts(), roster.value.patterns, {
      selfId: self.value?.id,
      selfName: self.value?.name
    })
))

/** 行内校验：只负责「姓名空 / 与本人同名 / 与前面某行重名」这三类最常见的提示 */
function rowError(index: number): string {
  const row = rows.value[index]
  if (!row) return ''
  const name = row.name.trim()
  if (!name) return '请填写姓名'

  const selfName = self.value?.name.trim()
  if (row.id !== selfId.value && selfName && name === selfName) {
    return '与本人同名，矩阵里会分不清'
  }

  const earlier = rows.value.findIndex((item, itemIndex) => (
    itemIndex < index && item.name.trim() === name
  ))
  if (earlier >= 0) return `与第 ${earlier + 1} 行重名`

  return ''
}

/** 有未保存改动时，页面底部为吸附保存栏多留出 64px */
const pageBottom = computed(() => (
  frame.tabBarHeight + (tab.value === 'roster' && !sorting.value && memberDirty.value ? 64 : 0)
))

function onRowInput(index: number, field: 'name' | 'position', event: any) {
  const row = rows.value[index]
  if (!row) return
  row[field] = event.detail.value
  memberDirty.value = true
}

function moveRow(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= rows.value.length) return
  const next = rows.value.slice()
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  rows.value = next
  memberDirty.value = true
}

function removeRow(index: number) {
  const row = rows.value[index]
  if (!row || row.id === selfId.value) return
  rows.value = rows.value.filter((_, rowIndex) => rowIndex !== index)
  memberDirty.value = true
}

function addRow() {
  const options = lookup.value.all
  const patternId = options[rows.value.length % Math.max(options.length, 1)]?.id ?? '4F'
  rows.value = [...rows.value, {
    key: createMemberId(),
    id: createMemberId(),
    name: '',
    patternId,
    position: ''
  }]
  memberDirty.value = true
}

function saveMembers() {
  if (memberErrors.value.length > 0) return

  const next = memberDrafts()
  const keptIds = new Set(next.map(member => member.id))
  const removed = roster.value.members.filter(member => !keptIds.has(member.id))
  const removedOverrides = removed.reduce(
    (total, member) => total + countOverrides(roster.value, member.id),
    0
  )

  store.saveMembers(next)
  memberDirty.value = false
  toast(removed.length > 0
    ? `已保存：删除 ${removed.length} 位成员，清理 ${removedOverrides} 条改班记录`
    : `已保存：${next.length} 位成员`
  )
}

/* ------------------------------------------------------------ 班序选择抽屉 */

interface PickerState {
  kind: 'member' | 'self'
  /** kind = member 时是成员草稿行号 */
  index: number
  currentId: string
}

const picker = ref<PickerState | null>(null)

function openPatternPicker(index: number) {
  const row = rows.value[index]
  if (!row) return
  picker.value = { kind: 'member', index, currentId: row.patternId }
}

function openSelfPatternPicker() {
  picker.value = { kind: 'self', index: -1, currentId: selfDraft.value.patternId }
}

function choosePattern(id: string) {
  const current = picker.value
  if (!current) return
  if (current.kind === 'member') {
    const row = rows.value[current.index]
    if (row) row.patternId = id
    memberDirty.value = true
  } else {
    selfDraft.value.patternId = id
  }
  picker.value = null
}

/* ------------------------------------------------------------ 个人资料 */

const selfDraft = ref({
  name: self.value?.name ?? '',
  patternId: self.value?.patternId ?? lookup.value.all[0]?.id ?? '4F',
  position: self.value?.position ?? ''
})
const selfErrors = ref<string[]>([])

watch(
  [() => self.value?.id, () => self.value?.name, () => self.value?.patternId, () => self.value?.position],
  () => {
    selfDraft.value = {
      name: self.value?.name ?? '',
      patternId: self.value?.patternId ?? lookup.value.all[0]?.id ?? '4F',
      position: self.value?.position ?? ''
    }
    selfErrors.value = []
    pendingImpact.value = null
  }
)

const identityDirty = computed(() => {
  const current = self.value
  if (!current) return Boolean(selfDraft.value.name.trim())
  return (
    selfDraft.value.name.trim() !== current.name
    || selfDraft.value.patternId !== current.patternId
    || selfDraft.value.position.trim() !== (current.position ?? '')
  )
})

const pendingImpact = ref<ReturnType<typeof selfImpact> | null>(null)

function onSelfName(event: any) {
  selfDraft.value.name = event.detail.value
  selfErrors.value = []
}

function onSelfPosition(event: any) {
  selfDraft.value.position = event.detail.value
  selfErrors.value = []
}

function submitIdentity() {
  const input = {
    name: selfDraft.value.name.trim(),
    patternId: selfDraft.value.patternId,
    position: selfDraft.value.position.trim()
  }

  const found = validateSelf(roster.value, input)
  if (found.length > 0) {
    selfErrors.value = found
    return
  }
  selfErrors.value = []

  if (!self.value) {
    store.saveSelf(input)
    toast(`已把「${input.name}」设为本人`)
    return
  }

  const impact = selfImpact(roster.value, input)
  if (!impact.changed) {
    if (input.position !== (self.value.position ?? '')) {
      store.saveSelf(input)
      toast('已更新本人的岗位')
    } else {
      toast('本人信息没有变化')
    }
    return
  }

  if (impact.overrides > 0 || impact.salaryFilled > 0) {
    pendingImpact.value = impact
    return
  }

  store.saveSelf(input)
  toast(`已更新本人：${input.name} · ${patternLabel(input.patternId)}`)
}

function confirmSwap() {
  const input = {
    name: selfDraft.value.name.trim(),
    patternId: selfDraft.value.patternId,
    position: selfDraft.value.position.trim()
  }
  store.saveSelf(input)
  pendingImpact.value = null
  toast(`已更换本人为「${input.name}」，此前的考勤记录与薪资已清空`)
}

/* ------------------------------------------------------------ 薪资 */

const salaryDraft = ref<SalaryInput>(
  roster.value.profile?.salary ? { ...roster.value.profile.salary } : { ...emptySalary }
)
const salaryDirty = ref(false)

watch(
  () => roster.value.profile?.salary,
  salary => {
    salaryDraft.value = salary ? { ...salary } : { ...emptySalary }
    salaryDirty.value = false
  },
  { deep: true }
)

function onSalaryInput(key: keyof SalaryInput, event: any) {
  salaryDraft.value[key] = sanitizeMoneyInput(event.detail.value)
  salaryDirty.value = true
}

function submitSalary() {
  if (!self.value) return
  store.saveSalary(salaryDraft.value)
  salaryDirty.value = false
  toast('已保存薪资基线')
}

/* ------------------------------------------------------------ 备份与清空 */

function onExport() {
  uni.setClipboardData({
    data: store.exportBackup(),
    success: () => toast('备份已复制到剪贴板')
  })
}

function onImport() {
  uni.getClipboardData({
    success: res => {
      try {
        const result = store.importBackup(String(res.data || ''))
        toast(`已恢复 ${result.memberCount} 人`)
      } catch (error) {
        toast((error as Error).message)
      }
    },
    fail: () => toast('读不到剪贴板')
  })
}

const confirmText = ref('')

function onConfirmInput(event: any) {
  confirmText.value = event.detail.value
}

function onClearAll() {
  if (confirmText.value.trim() !== '清空') return
  uni.showModal({
    title: '清空所有数据',
    content: '成员、班序、考勤与待办都会删除，且无法恢复。',
    confirmColor: '#b42318',
    success: res => {
      if (!res.confirm) return
      store.clearAll()
      confirmText.value = ''
      toast('已清空')
    }
  })
}

/** 24 格编辑器下方三档班次 */
const PALETTE = PATTERN_SHIFT_OPTIONS.map(shift => ({
  shift,
  label: SHIFT_META[shift].label,
  tone: SHIFT_META[shift].tone
}))
</script>

<style lang="scss" scoped>
@import './style.scss';
</style>
