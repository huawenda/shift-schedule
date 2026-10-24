import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getMarkClass, monthOptions, shiftInitial, shiftLabels, weekdayLabels } from '../../appConstants'
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

  function switchMonth(step: number) {
    const next = monthOptions[monthIndex + step]
    if (!next) return
    data.setActiveMonth(next.value)
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
            hoverClass="press-dim"
            onClick={() => switchMonth(-1)}
          >
            <Text>‹</Text>
          </View>
          <Text className="cal-month-text">{monthLabel}</Text>
          <View
            className={`cal-arrow ${monthIndex >= monthOptions.length - 1 ? 'is-off' : ''}`}
            hoverClass="press-dim"
            onClick={() => switchMonth(1)}
          >
            <Text>›</Text>
          </View>
        </View>
        <View
          className="cal-user"
          hoverClass="press-dim"
          onClick={() => data.isAdmin && setPickerOpen(true)}
        >
          <Text className="cal-user-name">{data.currentUser?.name ?? ''}</Text>
          <Text className="cal-user-group">{data.currentUser?.group ?? ''}</Text>
        </View>
      </View>

      <View className="cal-card">
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
              hoverClass="press-cell"
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
