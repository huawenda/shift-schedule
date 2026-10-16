import { useState, type ReactNode } from 'react'
import {
  calculateOvertimePay,
  type OvertimeChartItem,
  type PersonMonthlyStats,
  type SalaryCalculation,
  type SalaryInputValues,
  type ScheduleMonth,
  type ShiftType
} from '@local/core'
import type { SalaryInputField, SalarySaveStatus } from '../../appTypes'
import { monthOptions } from '../../appConstants'
import { useDialog } from '../../hooks/useDialog'
import { formatMoney, formatOvertimeHours } from '../../scheduleHelpers'

type StatsTab = 'overview' | 'daily'

interface StatsViewProps {
  isRefreshing: boolean
  monthEndDate: string
  monthStartDate: string
  overtimeChartItems: OvertimeChartItem[]
  overtimeChartMax: number
  personalStats: PersonMonthlyStats | null
  salaryCalculation: SalaryCalculation
  salaryInputs: SalaryInputValues
  salarySaveStatus: SalarySaveStatus
  selectedMonth: ScheduleMonth
  onBack: () => void
  onMonthChange: (month: ScheduleMonth) => void
  onRefresh: () => void
  onSalaryInputChange: (field: SalaryInputField, value: string) => void
}

export function StatsView({
  isRefreshing,
  monthEndDate,
  monthStartDate,
  overtimeChartItems,
  overtimeChartMax,
  personalStats,
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  selectedMonth,
  onBack,
  onMonthChange,
  onRefresh,
  onSalaryInputChange
}: StatsViewProps) {
  const [tab, setTab] = useState<StatsTab>('overview')
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false)
  const monthRef = useDialog(isMonthPickerOpen, () => setIsMonthPickerOpen(false))

  const tabs: Array<{ id: StatsTab; label: string }> = [
    { id: 'overview', label: '月度概览' },
    { id: 'daily', label: '每日明细' }
  ]
  const activeTab = tab

  return (
    <section className="stats">
      <header className="stats-bar">
        <button className="btn btn-ghost" type="button" onClick={onBack}>← 返回</button>
        <div className="stats-title-group">
          <h1 className="stats-title">统计</h1>
          <span className="stats-period">
            {monthStartDate.slice(5).replace('-', '/')} – {monthEndDate.slice(5).replace('-', '/')}
          </span>
        </div>
        <div className="top-bar-spacer" />
        <button className="btn" type="button" disabled={isRefreshing} onClick={onRefresh}>
          {isRefreshing ? '读取中…' : '刷新'}
        </button>
      </header>

      <div className="stats-filters">
        <button className="filter-chip" type="button" onClick={() => setIsMonthPickerOpen(true)}>
          <span className="filter-key">月份</span>
          {monthOptions.find(month => month.value === selectedMonth)?.label ?? `${Number(selectedMonth)}月`}
          <span aria-hidden="true">▾</span>
        </button>

        {/* 统计对象跟随排班页的人员选择，这里不再重复提供一个切换器 ——
            同一件事在两个页面各放一个控件，只会让人以为它们是独立的。
            需要换人时返回排班页切换即可。 */}
        <div className="top-bar-spacer" />

        <div className="segmented" role="tablist" aria-label="统计视图">
          {tabs.map(item => (
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === item.id}
              key={item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-body">
        <div className="stats-main">
          {activeTab === 'overview' && personalStats ? (
            <div className="stats-cards">
              <div className="stats-row">
                <section className="panel" style={{ padding: 'var(--sp-3)' }}>
                  <div className="section-head">
                    <h2 className="section-title">月度概览</h2>
                    <span className="section-meta">
                      加班 {formatOvertimeHours(personalStats.overtimeTotal)}h
                    </span>
                  </div>
                  <MonthlyOverview personalStats={personalStats} />
                </section>

                <section className="panel" style={{ padding: 'var(--sp-3)' }}>
                  <div className="section-head">
                    <h2 className="section-title">加班分布</h2>
                    <span className="section-meta">按类型</span>
                  </div>
                  <OvertimeChart items={overtimeChartItems} max={overtimeChartMax} />
                </section>
              </div>

              <SalarySection
                calculation={salaryCalculation}
                inputs={salaryInputs}
                saveStatus={salarySaveStatus}
                onInputChange={onSalaryInputChange}
              />
            </div>
          ) : null}

          {activeTab === 'daily' && personalStats ? (
            <div className="panel" style={{ padding: 'var(--sp-3)' }}>
              <div className="section-head">
                <h2 className="section-title">每日明细</h2>
                <span className="section-meta">{personalStats.dailyRecords.length} 条</span>
              </div>
              <DailyDetails personalStats={personalStats} salaryInputs={salaryInputs} />
            </div>
          ) : null}
        </div>
      </div>

      {isMonthPickerOpen ? (
        <Picker title="选择月份" sheetRef={monthRef} onClose={() => setIsMonthPickerOpen(false)}>
          <div className="month-grid">
            {monthOptions.map(month => (
              <button
                className="picker-item"
                type="button"
                aria-selected={selectedMonth === month.value}
                key={month.value}
                onClick={() => {
                  onMonthChange(month.value)
                  setIsMonthPickerOpen(false)
                }}
              >
                {month.label}
              </button>
            ))}
          </div>
        </Picker>
      ) : null}
    </section>
  )
}

function Picker({
  children,
  title,
  sheetRef,
  onClose
}: {
  children: ReactNode
  title: string
  sheetRef: React.RefObject<HTMLElement>
  onClose: () => void
}) {
  return (
    <div className="scrim" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={sheetRef}
        onClick={event => event.stopPropagation()}
      >
        <header className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button className="btn btn-ghost" type="button" onClick={onClose}>关闭</button>
        </header>
        <div className="picker-list">{children}</div>
      </section>
    </div>
  )
}

function MonthlyOverview({ personalStats }: { personalStats: PersonMonthlyStats }) {
  const rows = [
    { label: '白班', cls: 'shift-day', days: personalStats.shiftSummary.白班, hours: personalStats.shiftSummary.加班?.白班 ?? 0 },
    { label: '夜班', cls: 'shift-night', days: personalStats.shiftSummary.夜班, hours: personalStats.shiftSummary.加班?.夜班 ?? 0 },
    { label: '休息', cls: 'shift-rest', days: personalStats.shiftSummary.休息, hours: 0 },
    { label: '白特', cls: 'shift-special-day', days: personalStats.shiftSummary.白特, hours: personalStats.shiftSummary.加班?.白特 ?? 0 },
    { label: '夜特', cls: 'shift-special-night', days: personalStats.shiftSummary.夜特, hours: personalStats.shiftSummary.加班?.夜特 ?? 0 },
    { label: '法定', cls: 'shift-legal', days: personalStats.shiftSummary.法定 ?? 0, hours: personalStats.shiftSummary.加班?.法定 ?? 0 },
    { label: '事假', cls: 'shift-leave', days: personalStats.leaveSummary.days, hours: personalStats.leaveSummary.hours }
  ]

  return (
    <div className="overview">
      <div className="overview-row overview-head">
        <span>项目</span>
        <span className="num">天数</span>
        <span className="num">小时</span>
      </div>
      {rows.map(row => (
        <div className="overview-row" key={row.label}>
          <span>
            <span className={`overview-tag ${row.cls}`}>{row.label}</span>
          </span>
          <span className="overview-value">{row.days}</span>
          <span className={`overview-value ${row.hours > 0 ? '' : 'is-zero'}`}>
            {formatOvertimeHours(row.hours)}
          </span>
        </div>
      ))}
    </div>
  )
}

function OvertimeChart({ items, max }: { items: OvertimeChartItem[]; max: number }) {
  const hasData = items.some(item => item.hours > 0)

  if (!hasData) {
    return (
      <p className="empty">
        本月暂无加班记录。
        <span className="empty-hint">在排班表点开任意一天，选定加班时长后这里会出现分布。</span>
      </p>
    )
  }

  return (
    <div className="chart">
      {items.map(item => (
        <div className="chart-item" key={item.type}>
          <div>
            <div className="chart-track">
              <span
                className="chart-fill"
                style={{
                  height: `${max > 0 ? Math.max((item.hours / max) * 100, 3) : 0}%`,
                  ...barColors(item.type)
                }}
              />
            </div>
          </div>
          <div>
            <div className={`chart-value ${item.hours > 0 ? '' : 'is-zero'}`}>
              {formatOvertimeHours(item.hours)}h
            </div>
            <div className="chart-label">{item.type}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function barColors(type: string) {
  if (type === '平日') return { '--bar-edge': 'var(--day-ink)' } as React.CSSProperties
  if (type === '特勤') return { '--bar-edge': 'var(--specday-ink)' } as React.CSSProperties
  return { '--bar-edge': 'var(--legal-ink)' } as React.CSSProperties
}

function SalarySection({
  calculation,
  inputs,
  saveStatus,
  onInputChange
}: {
  calculation: SalaryCalculation
  inputs: SalaryInputValues
  saveStatus: SalarySaveStatus
  onInputChange: (field: SalaryInputField, value: string) => void
}) {
  const statusLabel = {
    pending: '待保存…', saving: '保存中…', saved: '已保存', error: '保存失败', idle: ''
  }[saveStatus]

  return (
    <section className="panel" style={{ padding: 'var(--sp-3)' }}>
      <div className="section-head">
        <h2 className="section-title">薪资计算</h2>
        {statusLabel ? (
          <span className={`save-status ${saveStatus === 'saved' ? 'is-saved' : saveStatus === 'error' ? 'is-error' : ''}`}>
            {statusLabel}
          </span>
        ) : null}
      </div>

      <div className="salary-block">
        <div className="salary-block-head">
          <h3 className="salary-block-title">基本项</h3>
          <span className="salary-block-total">小计 ¥{formatMoney(calculation.basicPayTotal)}</span>
        </div>
        <div className="salary-grid">
          <SalaryInput label="底薪" field="baseSalary" value={inputs.baseSalary} onChange={onInputChange} />
          <SalaryInput label="绩效津贴" field="performanceAllowance" value={inputs.performanceAllowance} onChange={onInputChange} />
          <SalaryInput label="岗位津贴" field="positionAllowance" value={inputs.positionAllowance} onChange={onInputChange} />
        </div>
        <p className="salary-footnote">时薪 ¥{formatMoney(calculation.hourlyWage)}（底薪 ÷ 21.75 ÷ 8）</p>
      </div>

      <div className="salary-block">
        <div className="salary-block-head">
          <h3 className="salary-block-title">加班工资</h3>
          <span className="salary-block-total">小计 ¥{formatMoney(calculation.overtimePayTotal)}</span>
        </div>
        <div className="salary-grid">
          <Readout label="平日 ×1.5" value={calculation.weekdayOvertimePay} />
          <Readout label="特勤 ×2" value={calculation.specialOvertimePay} accent="specday" />
          <Readout label="法定 ×3" value={calculation.legalOvertimePay} accent="legal" />
        </div>
      </div>

      <div className="salary-block">
        <div className="salary-block-head">
          <h3 className="salary-block-title">扣款项</h3>
          <span className="salary-block-total">小计 ¥{formatMoney(calculation.deductionTotal)}</span>
        </div>
        <div className="salary-grid">
          <Readout label="事假扣款" value={calculation.leaveDeduction} accent="specnight" />
          <SalaryInput label="其他扣款" field="otherDeductions" value={inputs.otherDeductions} onChange={onInputChange} />
        </div>
      </div>

      <div className="salary-block">
        <div className="salary-block-head">
          <h3 className="salary-block-title">汇总</h3>
        </div>
        <div className="salary-grid">
          <Readout label="应付工资" value={calculation.payableSalary} />
          <div className="salary-readout is-flag" style={{
            '--flag-fill': 'var(--face-3)', '--flag-edge': 'var(--signal)', '--flag-ink': 'var(--signal)'
          } as React.CSSProperties}>
            <span className="salary-readout-label">实付工资</span>
            <strong className="salary-readout-value">¥{formatMoney(calculation.netSalary)}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

function SalaryInput({
  field,
  label,
  value,
  onChange
}: {
  field: SalaryInputField
  label: string
  value: string
  onChange: (field: SalaryInputField, value: string) => void
}) {
  return (
    <label className="salary-field">
      <span className="salary-field-label">{label}</span>
      <span className="salary-input-box">
        <span className="salary-input-prefix" aria-hidden="true">¥</span>
        <input
          className="salary-input"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          name={field}
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={event => onChange(field, event.target.value)}
        />
      </span>
    </label>
  )
}

function Readout({
  accent,
  label,
  value
}: {
  accent?: 'legal' | 'specday' | 'specnight'
  label: string
  value: number
}) {
  const isZero = value <= 0
  const style = accent && !isZero
    ? ({
        '--flag-fill': `var(--${accent === 'specday' ? 'specday' : accent === 'legal' ? 'legal' : 'specnight'}-fill)`,
        '--flag-edge': `var(--${accent === 'specday' ? 'specday' : accent === 'legal' ? 'legal' : 'specnight'}-ink)`,
        '--flag-ink': `var(--${accent === 'specday' ? 'specday' : accent === 'legal' ? 'legal' : 'specnight'}-ink)`
      } as React.CSSProperties)
    : undefined

  return (
    <div className={`salary-readout ${style ? 'is-flag' : ''} ${isZero ? 'is-zero' : ''}`} style={style}>
      <span className="salary-readout-label">{label}</span>
      <strong className="salary-readout-value">¥{formatMoney(value)}</strong>
    </div>
  )
}

function DailyDetails({
  personalStats,
  salaryInputs
}: {
  personalStats: PersonMonthlyStats
  salaryInputs: SalaryInputValues
}) {
  const records = Array.from(
    new Map(personalStats.dailyRecords.map(record => [record.date, record])).values()
  )

  return (
    <div className="daily">
      <div className="daily-row daily-head">
        <span>日期</span>
        <span>班次</span>
        <span>加班类型</span>
        <span style={{ justifyContent: 'flex-end' }}>金额</span>
      </div>
      {records.map(record => {
        const pay = calculateOvertimePay(salaryInputs, record.overtimeHours, multiplierOf(record))
        const isZero = record.overtimeHours <= 0
        return (
          <div className={`daily-row ${isZero ? 'is-muted' : ''}`} key={record.date}>
            <span className="daily-date">{record.date}</span>
            <span className={`shift-option ${shiftClass(record.shift)}`} style={{ minHeight: 22, padding: '0 6px' }}>
              {record.shift}
            </span>
            <span className="daily-date">
              {record.isLegal ? '法定 ×3' : record.shift === '白特' || record.shift === '夜特' ? '特勤 ×2' : isZero ? '—' : '平日 ×1.5'}
            </span>
            <span className={`daily-pay ${isZero ? 'is-zero' : ''}`}>
              {isZero ? '—' : `¥${formatMoney(pay)}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}


function multiplierOf(record: { shift: ShiftType; isLegal?: boolean }) {
  if (record.isLegal) return 3
  if (record.shift === '白特' || record.shift === '夜特') return 2
  if (record.shift === '白班' || record.shift === '夜班') return 1.5
  return 0
}

function shiftClass(shift: ShiftType) {
  return {
    白班: 'shift-day',
    夜班: 'shift-night',
    休息: 'shift-rest',
    白特: 'shift-special-day',
    夜特: 'shift-special-night',
    事假: 'shift-leave'
  }[shift]
}