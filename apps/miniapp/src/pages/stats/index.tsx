import { useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { monthOptions } from '../../appConstants'
import { useScheduleData } from '../../hooks/useScheduleData'
import {
  readSalaryInputsFromStorage,
  saveSalaryInput,
  type SalaryInputRecords
} from '../../services/salaryInputs'
import { calculateSalary, emptySalaryInputs, type SalaryInputValues } from '../../utils/salary'
import { getPersonMonthlyStats } from '../../utils/statistics'
import { getSafeTop } from '../../utils/safeArea'
import './index.scss'

/**
 * 统计页（重写）。
 *
 * 旧版把「综合统计 / 每日明细 / 全员统计」三个视图塞进同一个页面，
 * 靠顶部 tab + 横向翻页切换，信息密度高但可读性差。
 *
 * 新版只留三块必要信息：本月加班分布、薪资明细、请假扣款，
 * 全部按「卡片 + 逐行」组织，一屏到底，不再有二级 tab。
 */
export default function StatsPage() {
  useDidShow(() => { Taro.eventCenter.trigger('tab-change', 2) })

  const data = useScheduleData()
  const [safeTop] = useState(() => getSafeTop())
  const [salaryRecords, setSalaryRecords] = useState<SalaryInputRecords>(readSalaryInputsFromStorage)

  const monthIndex = monthOptions.findIndex(option => option.value === data.activeMonth)
  const monthLabel = monthOptions[monthIndex]?.label ?? ''

  function switchMonth(step: number) {
    const next = monthOptions[monthIndex + step]
    if (!next) return
    data.setActiveMonth(next.value)
  }

  const stats = useMemo(() => {
    if (!data.currentUser) return null
    return getPersonMonthlyStats(
      data.monthView,
      data.currentUser.name,
      data.overrides.overtimeOverrides,
      data.overrides.shiftOverrides,
      data.overrides.legalOverrides,
      data.overrides.leaveDurationOverrides
    )
  }, [data.currentUser, data.monthView, data.overrides])

  const salaryKey = `${data.currentUser?.name ?? ''}::${data.activeMonth}`
  const inputs = salaryRecords[salaryKey] ?? emptySalaryInputs

  const overtime = (stats?.shiftSummary?.加班 ?? {}) as Partial<Record<'平日' | '特勤' | '法定', number>>
  const weekdayHours = overtime.平日 ?? 0
  const specialHours = overtime.特勤 ?? 0
  const legalHours = overtime.法定 ?? 0
  const leaveHours = stats?.leaveSummary.hours ?? 0
  const totalOvertime = weekdayHours + specialHours + legalHours

  const calc = calculateSalary(inputs, { weekdayHours, specialHours, legalHours, leaveHours })

  function setInput(field: keyof SalaryInputValues, value: string) {
    const next = { ...inputs, [field]: value }
    setSalaryRecords(records => ({ ...records, [salaryKey]: next }))
    void saveSalaryInput(salaryKey, next).catch(error => {
      console.warn('薪资保存失败', error)
      Taro.showToast({ title: '薪资保存失败', icon: 'none' })
    })
  }

  const maxHours = Math.max(weekdayHours, specialHours, legalHours, 1)
  const bars = [
    { key: '平日', hours: weekdayHours, cls: 'bar-weekday' },
    { key: '特勤', hours: specialHours, cls: 'bar-special' },
    { key: '法定', hours: legalHours, cls: 'bar-legal' }
  ]

  return (
    <View className="screen screen-with-tabbar stats-page">
      <View className="status-cover" style={{ height: safeTop }} />
      <View className="stats-top" style={{ paddingTop: safeTop }}>
        <View>
          <View className="stats-month-group">
            <View
              className={`step-arrow ${monthIndex <= 0 ? 'is-off' : ''}`}
              hoverClass={monthIndex <= 0 ? 'none' : 'press-dim'}
              onClick={() => switchMonth(-1)}
            >
              <Text>‹</Text>
            </View>
            <View className="step-label">
              <Text>{monthLabel}</Text>
            </View>
            <View
              className={`step-arrow ${monthIndex >= monthOptions.length - 1 ? 'is-off' : ''}`}
              hoverClass={monthIndex >= monthOptions.length - 1 ? 'none' : 'press-dim'}
              onClick={() => switchMonth(1)}
            >
              <Text>›</Text>
            </View>
          </View>
          <Text className="stats-sub">{data.currentUser?.name ?? ''} · {data.currentUser?.group ?? ''}</Text>
        </View>
        <View className="stats-total">
          <Text className="stats-total-num">{totalOvertime % 1 === 0 ? totalOvertime : totalOvertime.toFixed(1)}</Text>
          <Text className="stats-total-unit">小时加班</Text>
        </View>
      </View>

      <View className="card">
        <Text className="card-title">加班分布</Text>
        {bars.map(bar => (
          <View key={bar.key} className="bar-row">
            <Text className="bar-key">{bar.key}</Text>
            <View className="bar-track">
              <View className={`bar-fill ${bar.cls}`} style={{ width: `${(bar.hours / maxHours) * 100}%` }} />
            </View>
            <Text className="bar-val">{bar.hours % 1 === 0 ? bar.hours : bar.hours.toFixed(1)}h</Text>
          </View>
        ))}
        {totalOvertime === 0 ? <Text className="card-empty">本月暂无加班记录</Text> : null}
      </View>

      <View className="card">
        <Text className="card-title">薪资构成</Text>
        <View className="pay-row">
          <Text className="pay-label">基本工资</Text>
          <Input
            className="pay-input"
            type="digit"
            value={inputs.baseSalary}
            placeholder="0"
            onInput={event => setInput('baseSalary', String(event.detail.value))}
          />
        </View>
        <View className="pay-row">
          <Text className="pay-label">绩效津贴</Text>
          <Input
            className="pay-input"
            type="digit"
            value={inputs.performanceAllowance}
            placeholder="0"
            onInput={event => setInput('performanceAllowance', String(event.detail.value))}
          />
        </View>
        <View className="pay-row">
          <Text className="pay-label">岗位津贴</Text>
          <Input
            className="pay-input"
            type="digit"
            value={inputs.positionAllowance}
            placeholder="0"
            onInput={event => setInput('positionAllowance', String(event.detail.value))}
          />
        </View>
        <View className="pay-row">
          <Text className="pay-label">其他扣款</Text>
          <Input
            className="pay-input"
            type="digit"
            value={inputs.otherDeductions}
            placeholder="0"
            onInput={event => setInput('otherDeductions', String(event.detail.value))}
          />
        </View>

        <View className="pay-split" />
        <View className="pay-row">
          <Text className="pay-label">时薪</Text>
          <Text className="pay-value">{calc.hourlyWage.toFixed(2)}</Text>
        </View>
        <View className="pay-row">
          <Text className="pay-label">加班费</Text>
          <Text className="pay-value">{calc.overtimePayTotal.toFixed(2)}</Text>
        </View>
        <View className="pay-row">
          <Text className="pay-label">请假扣款</Text>
          <Text className="pay-value is-minus">-{calc.leaveDeduction.toFixed(2)}</Text>
        </View>
      </View>

      <View className="net">
        <Text className="net-label">本月实发</Text>
        <Text className="net-value">¥ {calc.netSalary.toFixed(2)}</Text>
      </View>
    </View>
  )
}
