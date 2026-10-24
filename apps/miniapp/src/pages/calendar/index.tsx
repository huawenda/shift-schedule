import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View, type CommonEvent, type ITouchEvent } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getMarkClass, monthOptions, shiftInitial, shiftLabels, weekdayLabels, type ScheduleMonth } from '../../appConstants'
import ShiftEditor from '../../components/ShiftEditor'
import TeamMatrix, { type MatrixMode } from '../../components/TeamMatrix'
import { useScheduleData, type ShiftDraft } from '../../hooks/useScheduleData'
import { getSafeTop } from '../../utils/safeArea'
import { getDateLabels } from '../../utils/schedule'
import './index.scss'

/**
 * 月历页。
 *
 * 旧版把一个 13 行 × 31 列的全员矩阵塞在日历下面，手机上既看不清也点不准。
 * 新版拆成两块：整月日历（点日期改班）+「今天同班」（按班次列出人名），
 * 后者回答的是同一个问题，但窄屏可读。
 */
export default function CalendarPage() {
  useDidShow(() => { Taro.eventCenter.trigger('tab-change', 1) })

  const data = useScheduleData()
  const [safeTop] = useState(() => getSafeTop())
  const [draft, setDraft] = useState<ShiftDraft | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [matrixMode, setMatrixMode] = useState<MatrixMode>('shift')

  const dateLabels = useMemo(
    () => getDateLabels(data.monthView.startDate, data.monthView.dates),
    [data.monthView.startDate, data.monthView.dates]
  )

  // 矩阵要标记所有人的加班/法定，不只是当前用户
  const matrixOvertimeKeys = useMemo(() => new Set(
    Object.keys(data.overrides.overtimeOverrides)
      .filter(key => (data.overrides.overtimeOverrides[key] ?? 0) > 0)
  ), [data.overrides.overtimeOverrides])

  const matrixLegalKeys = useMemo(() => new Set(
    Object.keys(data.overrides.legalOverrides)
      .filter(key => data.overrides.legalOverrides[key] === true)
  ), [data.overrides.legalOverrides])

  // 弹层打开时收起底部导航 —— custom-tab-bar 在独立组件层，
  // 页面内的 fixed + z-index 盖不住它，不收起会把弹层底部按钮压住。
  useEffect(() => {
    const opened = Boolean(draft) || pickerOpen
    Taro.eventCenter.trigger('tabbar-hide', opened)
    return () => { Taro.eventCenter.trigger('tabbar-hide', false) }
  }, [draft, pickerOpen])

  const monthIndex = monthOptions.findIndex(option => option.value === data.activeMonth)
  const monthLabel = monthOptions[monthIndex]?.label ?? ''
  // 浏览到别的月时月份文字旁亮蓝点，点一下回到本月。
  const currentMonth = data.todayKey.slice(0, 2) as ScheduleMonth
  const isCurrentMonth = data.activeMonth === currentMonth

  function switchMonth(step: number) {
    const next = monthOptions[monthIndex + step]
    if (!next) return
    data.setActiveMonth(next.value)
  }

  // 左右滑切月。微信在 touchend 时 touches 已清空（Round 2 审计 #1 的根因），
  // 起点终点都必须读 changedTouches。
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  function readSwipePoint(event: CommonEvent): { x: number; y: number } | null {
    // 运行时是触摸事件；Taro 把 View 的触摸 prop 标成通用事件类型，这里收窄。
    const touch = (event as unknown as ITouchEvent).changedTouches?.[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  function handleCardTouchStart(event: CommonEvent) {
    swipeStart.current = readSwipePoint(event)
  }

  function handleCardTouchEnd(event: CommonEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    const end = readSwipePoint(event)
    if (!start || !end) return
    const dx = end.x - start.x
    const dy = end.y - start.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      switchMonth(dx < 0 ? 1 : -1)
    }
  }

  function openDraft(date: string) {
    const next = data.openDraft(data.currentUser?.name ?? '', date)
    if (next) setDraft(next)
  }

  const todayIndex = data.monthView.dates.indexOf(data.todayKey)
  const sameDayGroups = shiftLabels
    .map(shift => ({
      shift,
      names: todayIndex >= 0
        ? data.monthView.people
          .filter(person => person.shifts[todayIndex] === shift)
          .map(person => person.name)
        : []
    }))
    .filter(group => group.names.length > 0)

  return (
    <View className="screen screen-with-tabbar cal-page">
      <View className="status-cover" style={{ height: safeTop }} />
      <View className="cal-top" style={{ paddingTop: safeTop }}>
        <View className="cal-month">
          <View
            className={`cal-arrow ${monthIndex <= 0 ? 'is-off' : ''}`}
            hoverClass={monthIndex <= 0 ? 'none' : 'press-dim'}
            onClick={() => switchMonth(-1)}
          >
            <Text>‹</Text>
          </View>
          <View
            className="cal-month-text"
            hoverClass={isCurrentMonth ? 'none' : 'press-dim'}
            onClick={() => data.setActiveMonth(currentMonth)}
          >
            <Text>{monthLabel}</Text>
            {isCurrentMonth ? null : <View className="cal-month-dot" />}
          </View>
          <View
            className={`cal-arrow ${monthIndex >= monthOptions.length - 1 ? 'is-off' : ''}`}
            hoverClass={monthIndex >= monthOptions.length - 1 ? 'none' : 'press-dim'}
            onClick={() => switchMonth(1)}
          >
            <Text>›</Text>
          </View>
        </View>
        <View
          className="cal-user"
          hoverClass={data.isAdmin ? 'press-dim' : 'none'}
          onClick={() => data.isAdmin && setPickerOpen(true)}
        >
          <Text className="cal-user-name">{data.currentUser?.name ?? ''}</Text>
          <Text className="cal-user-group">{data.currentUser?.group ?? ''}</Text>
        </View>
      </View>

      <View
        className="cal-card"
        onTouchStart={handleCardTouchStart}
        onTouchEnd={handleCardTouchEnd}
      >
        <View className="cal-week">
          {weekdayLabels.map(label => (
            <Text key={label} className="cal-week-text">{label}</Text>
          ))}
        </View>
        <View className="cal-grid">
          {data.calendarCells.map(cell => (
            <View
              key={cell.key}
              className="cal-cell"
              hoverClass={cell.inCurrentMonth ? 'press-cell' : 'none'}
              onClick={() => cell.inCurrentMonth && openDraft(cell.key)}
            >
              <View
                className={[
                  'cal-face',
                  cell.inCurrentMonth ? '' : 'is-out',
                  cell.key === data.todayKey ? 'is-today' : ''
                ].filter(Boolean).join(' ')}
              >
                <Text className="cal-day">{cell.day}</Text>
                {cell.shift ? (
                  <View className={`cal-mark ${getMarkClass(cell.shift)}`}>
                    <Text>{shiftInitial[cell.shift]}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="legend">
        {shiftLabels.map(shift => (
          <View key={shift} className="legend-item">
            <View className={`legend-dot ${getMarkClass(shift)}`} />
            <Text className="legend-text">{shift}</Text>
          </View>
        ))}
        <View className="legend-item">
          <View className="legend-dot is-round is-ot" />
          <Text className="legend-text">加班</Text>
        </View>
        <View className="legend-item">
          <View className="legend-dot is-round is-legal" />
          <Text className="legend-text">法定</Text>
        </View>
      </View>

      {/* 浏览非当月时整块隐藏：todayIndex 为 -1，硬显示会是误导性空态 */}
      {todayIndex >= 0 ? (
        <>
          <View className="block-title">
            <Text className="block-title-text">今天同班</Text>
            <Text className="block-title-sub">{data.todayKey} · {data.monthView.people.length} 人</Text>
          </View>
          <View className="mates">
            {sameDayGroups.length > 0 ? sameDayGroups.map(group => (
              <View key={group.shift} className="mate-row">
                <View className={`mate-tag ${getMarkClass(group.shift)}`}>
                  <Text>{group.shift}</Text>
                </View>
                <Text className="mate-names">{group.names.join('、')}</Text>
              </View>
            )) : <Text className="empty">今天没有排班记录</Text>}
          </View>
        </>
      ) : null}

      <TeamMatrix
        people={data.monthView.people}
        dates={data.monthView.dates}
        dateLabels={dateLabels}
        mode={matrixMode}
        currentUserName={data.currentUser?.name ?? ''}
        todayKey={data.todayKey}
        overtimeKeys={matrixOvertimeKeys}
        legalKeys={matrixLegalKeys}
        onOpen={(personName, date) => {
          const next = data.openDraft(personName, date)
          if (next) setDraft(next)
        }}
        onModeChange={setMatrixMode}
      />

      {draft ? (
        <ShiftEditor
          draft={draft}
          isAdmin={data.isAdmin}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => { data.saveShift(draft); setDraft(null) }}
        />
      ) : null}

      {pickerOpen ? (
        <View className="dlg-mask" onClick={() => setPickerOpen(false)}>
          <View className="dlg" onClick={event => event.stopPropagation()}>
            <View className="dlg-head">
              <Text className="dlg-title">切换人员</Text>
              <Text className="dlg-sub">管理员可查看任何人的排班</Text>
            </View>
            <View className="dlg-body">
              {data.monthView.people.map(person => (
                <View
                  key={person.name}
                  className={`pick-row ${person.name === data.currentUserName ? 'is-on' : ''}`}
                  hoverClass="press-surface"
                  onClick={() => {
                    data.setCurrentUserName(person.name)
                    setPickerOpen(false)
                  }}
                >
                  <Text className="pick-name">{person.name}</Text>
                  <Text className="pick-group">{person.group}</Text>
                </View>
              ))}
            </View>
            <View className="dlg-actions">
              <View className="btn-ghost" hoverClass="press-dim" onClick={() => setPickerOpen(false)}>
                关闭
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
