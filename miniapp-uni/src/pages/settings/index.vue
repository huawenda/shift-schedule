<template>
  <nav-bar />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }">
    <view class="me" @tap="onSelf">
      <view class="monogram">{{ profile.initial }}</view>
      <view class="me-main">
        <text class="me-name">{{ profile.name }}</text>
        <text class="me-sub">{{ profile.pattern }} · {{ profile.position }} · 本人</text>
      </view>
      <text class="row-arrow">›</text>
    </view>

    <view class="paper card group">
      <view class="group-head">
        <text class="group-title">SALARY</text>
        <text class="group-note">每月固定</text>
      </view>
      <view class="rows">
        <view class="row" @tap="onSalary">
          <view class="row-main">
            <text class="row-title">月度应发</text>
            <text class="row-sub">基本 {{ profile.salary.base }} · 绩效 {{ profile.salary.performance }} · 岗位 {{ profile.salary.position }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row" @tap="onSalary">
          <view class="row-main">
            <text class="row-title">社保公积金</text>
            <text class="row-sub">每月个人缴纳 {{ profile.salary.social }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="paper card group">
      <view class="group-head">
        <text class="group-title">ROSTER</text>
        <text class="group-note">{{ memberCount }} 人 · {{ patternCount }} 条班序</text>
      </view>
      <view class="rows">
        <view class="row" @tap="onMembers">
          <view class="row-main">
            <text class="row-title">成员与班序</text>
            <text class="row-sub">增删成员、编辑 24 天循环</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="paper card group">
      <view class="group-head">
        <text class="group-title">DATA</text>
        <text class="group-note">只在本机</text>
      </view>
      <view class="rows">
        <view class="row" @tap="onExport">
          <view class="row-main"><text class="row-title">导出备份</text></view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row" @tap="onImport">
          <view class="row-main"><text class="row-title">导入备份</text></view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row" @tap="onLoadDemo">
          <view class="row-main"><text class="row-title">载入演示数据</text></view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row is-danger" @tap="onClearAll">
          <view class="row-main"><text class="row-title is-danger">清空所有数据</text></view>
          <text class="row-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="paper card group">
      <view class="group-head">
        <text class="group-title">ABOUT</text>
      </view>
      <view class="rows">
        <view class="row is-static">
          <view class="row-main">
            <text class="row-title">离线运行</text>
            <text class="row-sub">数据只在本机，不上传</text>
          </view>
          <text class="row-value">v0.1</text>
        </view>
      </view>
    </view>
  </view>

  <!-- 本人编辑抽屉 -->
  <view v-if="selfEditor" class="backdrop" @tap="onCloseEditor">
    <view class="sheet" @tap.stop="onStop">
      <view class="sheet-head">
        <text class="sheet-title">本人</text>
        <text class="sheet-close" @tap="onCloseEditor">关闭</text>
      </view>

      <view class="field">
        <text class="field-label">姓名</text>
        <input class="input" :value="selfEditor.name" placeholder="必填" @input="onSelfName" />
      </view>

      <view class="field">
        <text class="field-label">岗位</text>
        <input class="input" :value="selfEditor.position" placeholder="可空" @input="onSelfPosition" />
      </view>

      <view class="field">
        <text class="field-label">班序</text>
        <scroll-view class="chips" scroll-x :show-scrollbar="false">
          <view
            v-for="item in patternOptions"
            :key="item.id"
            class="chip"
            :class="{ 'is-on': selfEditor.patternId === item.id }"
            @tap="selfEditor.patternId = item.id"
          >{{ item.name }}</view>
        </scroll-view>
      </view>

      <text v-if="selfImpactText" class="field-warn">{{ selfImpactText }}</text>

      <view class="sheet-foot">
        <view class="foot-actions is-end">
          <view class="btn" @tap="onCloseEditor">取消</view>
          <view class="btn btn-primary" :class="{ 'is-disabled': !canSaveSelf }" @tap="onSaveSelf">保存</view>
        </view>
      </view>
    </view>
  </view>

  <!-- 薪资编辑抽屉 -->
  <view v-if="salaryEditor" class="backdrop" @tap="onCloseEditor">
    <view class="sheet" @tap.stop="onStop">
      <view class="sheet-head">
        <text class="sheet-title">薪资</text>
        <text class="sheet-close" @tap="onCloseEditor">关闭</text>
      </view>

      <view v-for="field in SALARY_FIELDS" :key="field.key" class="field">
        <text class="field-label">{{ field.label }}</text>
        <input
          class="input"
          type="digit"
          :value="salaryEditor[field.key]"
          placeholder="未填"
          @input="onSalaryInput(field.key, $event)"
        />
      </view>

      <text class="field-note">金额只在本机保存，月度统计用这一组值。</text>

      <view class="sheet-foot">
        <view class="foot-actions is-end">
          <view class="btn" @tap="onCloseEditor">取消</view>
          <view class="btn btn-primary" @tap="onSaveSalary">保存</view>
        </view>
      </view>
    </view>
  </view>

  <tab-bar :current="2" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'
import { rosterStore } from '../../store/roster'
import { getSelf, patternLabelOf, selfImpact } from '../../data/roster'
import { BUILTIN_PATTERNS, resolvePatterns } from '../../data/patterns'
import { SALARY_FIELDS, sanitizeMoneyInput, type SalaryInput } from '../../data/profile'

const store = rosterStore
const roster = computed(() => store.state.roster)
const self = computed(() => getSelf(roster.value))
const salary = computed<SalaryInput>(() => roster.value.profile?.salary ?? {
  baseSalary: '',
  performanceAllowance: '',
  positionAllowance: '',
  socialFund: ''
})

const profile = computed(() => ({
  initial: self.value ? self.value.name.slice(0, 1) : '·',
  name: self.value ? self.value.name : '还没有设置本人',
  pattern: self.value ? patternLabelOf(roster.value, self.value) : '—',
  position: self.value?.position || '—',
  salary: {
    base: salary.value.baseSalary || '—',
    performance: salary.value.performanceAllowance || '—',
    position: salary.value.positionAllowance || '—',
    social: salary.value.socialFund || '—'
  }
}))

const memberCount = computed(() => roster.value.members.length)
const patternCount = computed(() => BUILTIN_PATTERNS.length + roster.value.patterns.length)

/** 本人抽屉 / 薪资抽屉 */
const selfEditor = ref<{ name: string; position: string; patternId: string } | null>(null)
const salaryEditor = ref<SalaryInput | null>(null)

const patternOptions = computed(() => {
  const lookup = resolvePatterns(roster.value.patterns)
  return lookup.all.map(pattern => ({ id: pattern.id, name: lookup.labelOf(pattern.id) }))
})

const canSaveSelf = computed(() => Boolean(selfEditor.value && selfEditor.value.name.trim()))

/** 改姓名或班序 = 换人：先把会被清空的数据算给用户看 */
const selfImpactText = computed(() => {
  if (!selfEditor.value || !self.value) return ''
  const impact = selfImpact(roster.value, selfEditor.value)
  if (!impact.changed || impact.overrides === 0) return ''
  return `改名或改班序会清空 ${impact.overrides} 条考勤记录（含加班 ${impact.overtime} 条）与薪资`
})

function onMembers() {
  uni.navigateTo({ url: '/pages/members/index' })
}

function onSelf() {
  const current = self.value
  selfEditor.value = current
    ? { name: current.name, position: current.position || '', patternId: current.patternId }
    : { name: '', position: '', patternId: '4F' }
}

function onSelfName(event: any) {
  if (selfEditor.value) selfEditor.value.name = event.detail.value
}

function onSelfPosition(event: any) {
  if (selfEditor.value) selfEditor.value.position = event.detail.value
}

function onSaveSelf() {
  if (!selfEditor.value || !canSaveSelf.value) return
  const result = store.saveSelf({
    name: selfEditor.value.name.trim(),
    patternId: selfEditor.value.patternId,
    position: selfEditor.value.position.trim()
  })
  selfEditor.value = null
  uni.showToast({
    title: result.clearedOverrides > 0 ? `已清空 ${result.clearedOverrides} 条记录` : '已保存',
    icon: 'none'
  })
}

function onSalary() {
  if (!roster.value.profile) {
    uni.showToast({ title: '请先设置本人', icon: 'none' })
    return
  }
  salaryEditor.value = { ...salary.value }
}

function onSalaryInput(key: keyof SalaryInput, event: any) {
  if (!salaryEditor.value) return
  salaryEditor.value[key] = sanitizeMoneyInput(event.detail.value)
}

function onSaveSalary() {
  if (!salaryEditor.value) return
  store.saveSalary(salaryEditor.value)
  salaryEditor.value = null
  uni.showToast({ title: '已保存', icon: 'none' })
}

function onCloseEditor() {
  selfEditor.value = null
  salaryEditor.value = null
}

function onStop() {}

/* ------------------------------------------------------------ 数据管理 */

function onExport() {
  uni.setClipboardData({
    data: store.exportBackup(),
    success: () => uni.showToast({ title: '备份已复制到剪贴板', icon: 'none' })
  })
}

function onImport() {
  uni.getClipboardData({
    success: res => {
      try {
        const result = store.importBackup(String(res.data || ''))
        uni.showToast({ title: `已恢复 ${result.memberCount} 人`, icon: 'none' })
      } catch (error) {
        uni.showToast({ title: (error as Error).message, icon: 'none' })
      }
    },
    fail: () => uni.showToast({ title: '读不到剪贴板', icon: 'none' })
  })
}

function onLoadDemo() {
  uni.showModal({
    title: '载入演示数据',
    content: '会覆盖当前全部数据，确定吗？',
    success: res => {
      if (!res.confirm) return
      store.loadDemo()
      uni.showToast({ title: '已载入演示数据', icon: 'none' })
    }
  })
}

function onClearAll() {
  uni.showModal({
    title: '清空所有数据',
    content: '成员、班序、考勤与待办都会删除，且无法恢复。',
    confirmColor: '#93261c',
    success: res => {
      if (!res.confirm) return
      store.clearAll()
      uni.showToast({ title: '已清空', icon: 'none' })
    }
  })
}
</script>

<style lang="scss">
/* 设置页整页就是纸：非 scoped，才能命中 page 选择器（只作用于本页） */
page {
  background: var(--surface);
}
</style>

<style lang="scss" scoped>
@import './style.scss';
</style>
