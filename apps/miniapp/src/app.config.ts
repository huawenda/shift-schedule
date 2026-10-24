export default defineAppConfig({
  pages: [
    'pages/today/index',
    'pages/calendar/index',
    'pages/stats/index'
  ],
  tabBar: {
    custom: true,
    color: '#94a3b8',
    selectedColor: '#2563eb',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/today/index', text: '今日' },
      { pagePath: 'pages/calendar/index', text: '月历' },
      { pagePath: 'pages/stats/index', text: '统计' }
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationStyle: 'custom',
    navigationBarBackgroundColor: '#eef1f6',
    navigationBarTitleText: '倒班表',
    navigationBarTextStyle: 'black'
  }
})
