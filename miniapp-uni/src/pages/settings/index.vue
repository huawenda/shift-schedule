<template>
  <nav-bar />

  <view class="page" :style="{ paddingTop: frame.navHeight + 'px', paddingBottom: frame.tabBarHeight + 'px' }">
    <view class="me" @tap="onSoon">
      <view class="monogram">华</view>
      <view class="me-main">
        <text class="me-name">{{ profile.name }}</text>
        <text class="me-sub">{{ profile.pattern }} · {{ profile.position }} · 本人</text>
      </view>
      <text class="row-arrow">›</text>
    </view>

    <view class="group">
      <view class="group-head">
        <text class="group-title">SALARY</text>
        <text class="group-note">每月固定</text>
      </view>
      <view class="rows">
        <view class="row" @tap="onSoon">
          <view class="row-main">
            <text class="row-title">月度应发</text>
            <text class="row-sub">基本 {{ profile.salary.base }} · 绩效 {{ profile.salary.performance }} · 岗位 {{ profile.salary.position }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row" @tap="onSoon">
          <view class="row-main">
            <text class="row-title">社保公积金</text>
            <text class="row-sub">每月个人缴纳 {{ profile.salary.social }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="group">
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

    <view class="group">
      <view class="group-head">
        <text class="group-title">DATA</text>
        <text class="group-note">只在本机</text>
      </view>
      <view class="rows">
        <view class="row" @tap="onSoon">
          <view class="row-main"><text class="row-title">导出备份</text></view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row" @tap="onSoon">
          <view class="row-main"><text class="row-title">导入备份</text></view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row" @tap="onSoon">
          <view class="row-main"><text class="row-title">载入演示数据</text></view>
          <text class="row-arrow">›</text>
        </view>
        <view class="row is-danger" @tap="onSoon">
          <view class="row-main"><text class="row-title is-danger">清空所有数据</text></view>
          <text class="row-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="group">
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

  <tab-bar :current="2" />
</template>

<script setup lang="ts">
import demo from '../../utils/demo.js'
import { frame } from '../../utils/app-frame'
import NavBar from '../../components/nav-bar.vue'
import TabBar from '../../components/tab-bar.vue'

const profile = demo.profile
const memberCount = demo.members.length
const patternCount = demo.patterns.length

function onMembers() {
  uni.navigateTo({ url: '/pages/members/index' })
}

function onSoon() {
  uni.showToast({ title: '演示阶段暂未接通', icon: 'none' })
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
