import { useState } from 'react'
import type {
  OvertimeChartItem,
  PersonMonthlyStats,
  SalaryCalculation,
  SalaryInputValues,
  ScheduleMonth
} from '@local/core'
import { monthOptions } from '../../appConstants'
import type { SalaryInputField, SalarySaveStatus } from '../../appTypes'
import { ShiftMark } from '../../components/ShiftMark'
import { formatMoney } from '../../scheduleHelpers'

type StatsPage = 'summary' | 'daily'

interface StatsViewProps {
  isRefreshing: boolean
  monthEndDate: string
  monthStartDate: string
  overtimeChartItems: OvertimeChartItem[]
  overtimeChartMax: number
  personGroup: string
  personName: string
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

const saveStateText: Record<SalarySaveStatus, string> = {
  idle: '',
  pending: '待保存…',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败'
}

export function StatsView({
  isRefreshing,
  monthEndDate,
  monthStartDate,
  overtimeChartItems,
  overtimeChartMax,
  personGroup,
  personName,
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
  const [page, setPage] = useState<StatsPage>('summary')
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false)

  const monthLabel = monthOptions.find(option => option.value === selectedMonth)?.label ?? selectedMonth

  if (!personalStats) {
    return (
      <>
        <header className="stats-head">
          <button className="back" type="button" onClick={onBack}>← 返回</button>
          <h1>统计</h1>
          <span className="range">{monthStartDate} – {monthEndDate}</span>
        </header>
        <p className="bars-empty">当前月份还没有可统计的数据</p>
      </>
    )
  }

  const shiftSummary = personalStats.shiftSummary
  const overtime = shiftSummary.加班

  const rows: { label: string; cls?: string; days: number; hours: number }[] = [
    { label: '白班', cls: 's-day', days: shiftSummary.白班, hours: overtime?.白班 ?? 0 },
    { label: '夜班', cls: 's-night', days: shiftSummary.夜班, hours: overtime?.夜班 ?? 0 },
    { label: '休息', cls: 's-rest', days: shiftSummary.休息, hours: 0 },
    { label: '白特', cls: 's-dayx', days: shiftSummary.白特, hours: overtime?.白特 ?? 0 },
    { label: '夜特', cls: 's-nightx', days: shiftSummary.夜特, hours: overtime?.夜特 ?? 0 },
    { label: '法定', days: shiftSummary.法定 ?? 0, hours: overtime?.法定 ?? 0 },
    { label: '事假', cls: 's-leave', days: personalStats.leaveSummary.days, hours: personalStats.leaveSummary.hours }
  ]
  const totalDays = rows.reduce((total, row) => total + row.days, 0)

  return (
    <>
      <header className="stats-head">
        <button className="back" type="button" onClick={onBack}>← 返回</button>
        <h1>统计</h1>
        <span className="range">{monthStartDate} – {monthEndDate}</span>
        <span className="spacer" />
        <button className="act" type="button" disabled={isRefreshing} onClick={onRefresh}>
          {isRefreshing ? '读取中…' : '刷新'}
        </button>
      </header>

      <div className="stats-tabs" role="tablist" aria-label="统计视图">
        <button aria-selected={page === 'summary'} role="tab" type="button" onClick={() => setPage('summary')}>
          综合统计
        </button>
        <button aria-selected={page === 'daily'} role="tab" type="button" onClick={() => setPage('daily')}>
          每日明细
        </button>
        <span className="spacer" />
        {saveStateText[salarySaveStatus] ? (
          <span className={salarySaveStatus === 'error' ? 'save-state error' : 'save-state'}>
            {saveStateText[salarySaveStatus]}
          </span>
        ) : null}
      </div>

      <div className="stats-filters">
        <div className="filter">
          <span className="k">月份</span>
          <button className="v" type="button" onClick={() => setIsMonthPickerOpen(true)}>{monthLabel}</button>
        </div>
        <div className="filter">
          <span className="k">用户</span>
          <span className="v">{personName}<span className="muted"> / {personGroup}</span></span>
        </div>
        <div className="filter">
          <span className="k">加班合计</span>
          <span className="v">{personalStats.overtimeTotal} h</span>
        </div>
      </div>

      {page === 'summary' ? (
        <>
          <div className="zones">
            <section className="page-section">
              <div className="sec-head">
                <h2>月度概览</h2>
                <span className="sub">{totalDays} 天 · 加班 {personalStats.overtimeTotal} 小时</span>
              </div>
              <div className="ovw">
                <div className="ovw-row is-head">
                  <span>项目</span>
                  <span>天数</span>
                  <span>加班</span>
                </div>
                {rows.map(row => (
                  <div className="ovw-row" key={row.label}>
                    <span className="ovw-name">
                      {row.cls
                        ? <span className={`swatch ${row.cls}`} />
                        : <span className="legal-dot" />}
                      {row.label}
                    </span>
                    <b>{row.days}</b>
                    <span className={row.hours > 0 ? 'hrs active' : 'hrs'}>{row.hours} h</span>
                  </div>
                ))}
              </div>
              <div className="ovw-total">
                <span>本月加班合计</span>
                <b>{personalStats.overtimeTotal} h</b>
              </div>
            </section>

            <section className="page-section">
              <div className="sec-head">
                <h2>加班分布</h2>
                <span className="sub">按类型</span>
              </div>
              {overtimeChartMax === 0 ? (
                <p className="bars-empty">本月没有加班记录</p>
              ) : (
                <div className="bars">
                  <div className="bars-plot">
                    {overtimeChartItems.map(item => (
                      <div className="col" key={item.type}>
                        <span className="v">{item.hours} h</span>
                        <span
                          className={item.type === '特勤' ? 'fill special' : item.type === '法定' ? 'fill legal' : 'fill'}
                          style={{ height: `${Math.max(3, (item.hours / overtimeChartMax) * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="bars-axis">
                    {overtimeChartItems.map(item => <span key={item.type}>{item.type}</span>)}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="page-section payslip">
            <div className="sec-head">
              <h2>薪资计算</h2>
              <span className="sub">时薪 ¥{formatMoney(salaryCalculation.hourlyWage)} · 月计薪 21.75 天 × 8 小时</span>
            </div>
            <div className="pay-grid">
              <div className="pay-block">
                <div className="pay-block-head">
                  <h3>基本项</h3>
                  <span className="sum">小计 ¥{formatMoney(salaryCalculation.basicPayTotal)}</span>
                </div>
                {payInput('baseSalary', '底薪', salaryInputs.baseSalary)}
                {payInput('performanceAllowance', '绩效津贴', salaryInputs.performanceAllowance)}
                {payInput('positionAllowance', '岗位津贴', salaryInputs.positionAllowance)}
              </div>

              <div className="pay-block">
                <div className="pay-block-head">
                  <h3>加班工资</h3>
                  <span className="sum">小计 ¥{formatMoney(salaryCalculation.overtimePayTotal)}</span>
                </div>
                {payAmount('平日加班 ×1.5', salaryCalculation.weekdayOvertimePay)}
                {payAmount('特勤加班 ×2', salaryCalculation.specialOvertimePay)}
                {payAmount('法定加班 ×3', salaryCalculation.legalOvertimePay)}
              </div>

              <div className="pay-block">
                <div className="pay-block-head">
                  <h3>扣款项</h3>
                  <span className="sum deduction">小计 ¥{formatMoney(salaryCalculation.deductionTotal)}</span>
                </div>
                {payAmount('事假扣款', salaryCalculation.leaveDeduction)}
                {payInput('otherDeductions', '其他扣款', salaryInputs.otherDeductions)}
              </div>

              <div className="pay-net">
                <div>
                  <div className="k">实付工资</div>
                  <div className="v">¥{formatMoney(salaryCalculation.netSalary)}</div>
                </div>
                <div className="side">
                  应付
                  <b>¥{formatMoney(salaryCalculation.payableSalary)}</b>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="page-section">
          <div className="sec-head">
            <h2>每日明细</h2>
            <span className="sub">点班次格可修改 · 加班按当日倍率计薪</span>
          </div>
          <div className="daily">
            <div className="daily-row is-head">
              <span>日期</span>
              <span>班次</span>
              <span>加班</span>
              <span>金额</span>
            </div>
            {personalStats.dailyRecords.map(record => {
              const multiplier = record.isLegal ? 3 : record.shift === '白特' || record.shift === '夜特' ? 2 : 1.5
              const pay = record.overtimeHours > 0
                ? salaryCalculation.hourlyWage * record.overtimeHours * multiplier
                : 0
              return (
                <div
                  className={[
                    'daily-row',
                    record.shift === '休息' ? 'is-rest' : '',
                    record.overtimeHours > 0 ? 'has-overtime' : ''
                  ].filter(Boolean).join(' ')}
                  key={record.date}
                >
                  <span className="date">{record.date}</span>
                  <span className="day-shift">
                    <ShiftMark shift={record.shift} />
                    {record.isLegal ? <span className="legal-dot" /> : null}
                  </span>
                  <span className={record.overtimeHours > 0 ? 'hrs' : 'hrs placeholder'}>
                    {record.overtimeHours > 0 ? `${record.overtimeHours} h` : '—'}
                  </span>
                  <span className={[
                    'pay',
                    record.overtimeHours > 0 ? '' : 'placeholder',
                    // 金额分三档递进放大，小字 ¥ 配大数字，让「当天赚到多少」一眼可读
                    record.overtimeHours > 0 && pay >= 400 ? 'is-big' : '',
                    record.overtimeHours > 0 && pay >= 100 && pay < 400 ? 'is-mid' : ''
                  ].filter(Boolean).join(' ')}>
                    {record.overtimeHours > 0 ? (
                      <>
                        <span className="pay-cur">¥</span>
                        <b>{formatMoney(pay)}</b>
                      </>
                    ) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {isMonthPickerOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsMonthPickerOpen(false)}>
          <section
            aria-label="选择月份"
            aria-modal="true"
            className="picker"
            role="dialog"
            onClick={event => event.stopPropagation()}
          >
            <header className="picker-head">
              <h2>选择月份</h2>
              <button className="act" type="button" onClick={() => setIsMonthPickerOpen(false)}>关闭</button>
            </header>
            <div className="picker-list">
              {monthOptions.map(option => (
                <button
                  aria-selected={option.value === selectedMonth}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onMonthChange(option.value)
                    setIsMonthPickerOpen(false)
                  }}
                >
                  <span>{option.label}</span>
                  <span className="tick" />
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )

  function payInput(field: SalaryInputField, label: string, value: SalaryInputValues[SalaryInputField]) {
    return (
      <label className="pay-row pay-input" key={field}>
        <span>{label}</span>
        <span className="amount">
          <span className="cur">¥</span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={value === '' ? '' : String(value)}
            onChange={event => onSalaryInputChange(field, event.target.value)}
          />
        </span>
      </label>
    )
  }
}

function payAmount(label: string, value: number) {
  return (
    <div className="pay-row" key={label}>
      <span>{label}</span>
      <span className="amount">
        <span className="cur">¥</span>
        <b>{formatMoney(value)}</b>
      </span>
    </div>
  )
}
