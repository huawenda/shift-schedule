import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

const tabs = [
  { key: 'today', text: '今日', path: '/pages/today/index' },
  { key: 'calendar', text: '月历', path: '/pages/calendar/index' },
  { key: 'stats', text: '统计', path: '/pages/stats/index' }
]

/**
 * 自定义底部导航。
 *
 * 小程序原生 tabBar 只能用图片图标，这里改用 custom + 纯 View 画图标，
 * 好处是颜色跟随 currentColor（选中自动变品牌蓝），不用维护两套 png。
 *
 * 选中态通过 Taro.eventCenter 同步：各 tab 页在 useDidShow 里
 * trigger('tab-change', index)，避免依赖 getTabBar().setData 那套实例 API。
 */
export default function CustomTabBar() {
  const [selected, setSelected] = useState(0)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    // 1) 首次挂载时按页面栈里的当前路由定位（页面 onShow 的触发时机
    //    在 custom-tab-bar 挂载之前，靠事件会漏掉第一次）。
    try {
      const pages = Taro.getCurrentPages()
      const current = pages[pages.length - 1]
      const route = current?.route ?? ''
      const index = tabs.findIndex(tab => tab.path.replace(/^\//, '') === route)
      if (index >= 0) setSelected(index)
    } catch (error) {
      console.warn('tabBar 初始化定位失败', error)
    }

    // 2) 后续切换靠页面 useDidShow 里 trigger 的事件。
    const handler = (index: number) => setSelected(index)
    // 3) 弹层打开时隐藏：custom-tab-bar 是独立组件层，
    //    页面里的 position:fixed + z-index 盖不住它，会把弹层底部按钮压住。
    const hideHandler = (value: boolean) => setHidden(value)

    Taro.eventCenter.on('tab-change', handler)
    Taro.eventCenter.on('tabbar-hide', hideHandler)
    return () => {
      Taro.eventCenter.off('tab-change', handler)
      Taro.eventCenter.off('tabbar-hide', hideHandler)
    }
  }, [])

  if (hidden) return null

  function go(index: number) {
    if (index === selected) return
    setSelected(index)
    void Taro.switchTab({ url: tabs[index].path })
  }

  function renderIcon(key: string) {
    if (key === 'today') {
      return (
        <View className="ico ico-today">
          <View className="ico-today-dot" />
        </View>
      )
    }
    if (key === 'calendar') {
      return (
        <View className="ico ico-cal">
          <View className="ico-cal-bar" />
          <View className="ico-cal-dot d1" />
          <View className="ico-cal-dot d2" />
          <View className="ico-cal-dot d3" />
        </View>
      )
    }
    return (
      <View className="ico ico-stats">
        <View className="ico-bar b1" />
        <View className="ico-bar b2" />
        <View className="ico-bar b3" />
      </View>
    )
  }

  return (
    <View className="tabbar">
      {tabs.map((tab, index) => (
        <View
          key={tab.key}
          className={`tabbar-item ${index === selected ? 'is-on' : ''}`}
          hoverClass="tabbar-press"
          hoverStartTime={0}
          hoverStayTime={80}
          onClick={() => go(index)}
        >
          {renderIcon(tab.key)}
          <Text className="tabbar-text">{tab.text}</Text>
        </View>
      ))}
    </View>
  )
}
