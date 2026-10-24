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

/** 账本金额：千分位 + 两位小数，配 tabular-nums 右对齐。 */
function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

const inputRows: Array<{ field: keyof SalaryInputValues; label: string }> = [
  { field: 'baseSalary', label: '基本工资' },
  { field: 'performanceAllowance', label: '绩效津贴' },
  { field: 'positionAllowance', label: '岗位津贴' },
  { field: 'otherDeductions', label: '其他扣款' }
]

/**
 * 统计页（值班白板版）：一张账本报表。
 * 金额右对齐 + 千分位 + 会计双线合实发；加班分布用刻度条。
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
          <Text className="stats-sub">{data.currentUser?.name ?? ''} {data.currentUser?.group ?? ''}</Text>
        </View>
      </View>

      <View className="sect">
        <View className="ledger-head">
          <Text className="ledger-title">加班合计</Text>
          <Text className="ledger-total">{formatHours(totalOvertime)}h</Text>
        </View>
        {bars.map(bar => (
          <View key={bar.key} className="bar-row">
            <Text className="bar-key">{bar.key}</Text>
            <View className="bar-track">
              <View className={`bar-fill ${bar.cls}`} style={{ width: `${(bar.hours / maxHours) * 100}%` }} />
            </View>
            <Text className="bar-val">{formatHours(bar.hours)}h</Text>
          </View>
        ))}
        {totalOvertime === 0 ? <Text className="ledger-empty">本月暂无加班记录</Text> : null}
      </View>

      <View className="sect">
        <View className="sect-title">
          <Text className="sect-title-text">薪资</Text>
          <Text className="sect-title-sub">金额可自行修改，仅存本机</Text>
        </View>
        {inputRows.map(row => (
          <View key={row.field} className="pay-row">
            <Text className="pay-label">{row.label}</Text>
            <Input
              className="pay-input"
              type="digit"
              value={inputs[row.field]}
              placeholder="0"
              onInput={event => setInput(row.field, String(event.detail.value))}
            />
          </View>
        ))}

        <View className="pay-split" />
        <View className="pay-row">
          <Text className="pay-label">时薪</Text>
          <Text className="pay-value">{formatMoney(calc.hourlyWage)}</Text>
        </View>
        <View className="pay-row">
          <Text className="pay-label">加班费</Text>
          <Text className="pay-value">{formatMoney(calc.overtimePayTotal)}</Text>
        </View>
        <View className="pay-row">
          <Text className="pay-label">请假扣款</Text>
          <Text className="pay-value is-minus">-{formatMoney(calc.leaveDeduction)}</Text>
        </View>

        <View className="net-rule" />
        <View className="net">
          <Text className="net-label">本月实发</Text>
          <Text className="net-value">{formatMoney(calc.netSalary)}</Text>
        </View>
      </View>
    </View>
  )
}
