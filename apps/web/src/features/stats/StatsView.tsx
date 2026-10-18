import { useState } from 'react'
import type {
  AllPeopleMonthlyOvertimeStats,
  PersonMonthlyStats,
  PersonOvertimeStats,
  SalaryCalculation,
  SalaryInputValues,
  ScheduleMonth,
  SchedulePerson
} from '@shift-schedule/core'
import { formatMoney, getOvertimeChartItems } from '@shift-schedule/core'
import { monthOptions } from '../../appConstants'
import type { SalaryInputField, SalarySaveStatus, StatsViewMode } from '../../appTypes'
import { useBackDismiss } from '../../hooks/useBackDismiss'
import { ShiftMark } from '../../components/ShiftMark'

type StatsPage = 'summary' | 'daily'

interface StatsViewProps {
  isAdminUser: boolean
  isSyncing: boolean
  monthEndDate: string
  monthStartDate: string
  personalStats: PersonMonthlyStats | null
  salaryCalculation: SalaryCalculation
  salaryInputs: SalaryInputValues
  salarySaveStatus: SalarySaveStatus
  selectedMonth: ScheduleMonth
  statsPerson: SchedulePerson
  statsViewMode: StatsViewMode
  teamStats: AllPeopleMonthlyOvertimeStats
  onBack: () => void
  onMonthChange: (month: ScheduleMonth) => void
  onRefresh: () => void
  onSalaryInputChange: (field: SalaryInputField, value: string) => void
  onStatsPersonChange: (name: string) => void
  onStatsViewModeChange: (mode: StatsViewMode) => void
}

const saveStateText: Record<SalarySaveStatus, string> = {
  idle: '',
  pending: '待保存…',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败'
}

export function StatsView({
  isAdminUser,
  isSyncing,
  monthEndDate,
  monthStartDate,
  personalStats,
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  selectedMonth,
  statsPerson,
  statsViewMode,
  teamStats,
  onBack,
  onMonthChange,
  onRefresh,
  onSalaryInputChange,
  onStatsPersonChange,
  onStatsViewModeChange
}: StatsViewProps) {
  const [page, setPage] = useState<StatsPage>('summary')
  const [picker, setPicker] = useState<'month' | 'person' | null>(null)

  useBackDismiss(picker !== null, () => setPicker(null))

  const isTeam = statsViewMode === 'team'

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
  const chartItems = getOvertimeChartItems(overtime)
  const chartMax = chartItems.reduce((max, item) => Math.max(max, item.hours), 0)
  const teamMax = teamStats.people.reduce((max, person) => Math.max(max, person.totalHours), 0)
  const monthLabel = monthOptions.find(option => option.value === selectedMonth)?.label ?? selectedMonth

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

  function changeMode(mode: StatsViewMode, nextPage: StatsPage) {
    onStatsViewModeChange(mode)
    setPage(nextPage)
  }

  return (
    <>
      <header className="stats-head">
        <button className="back" type="button" onClick={onBack}>← 返回</button>
        <h1>统计</h1>
        <span className="range">{monthStartDate} – {monthEndDate}</span>
        <span className="spacer" />
        <button className="act" type="button" onClick={onRefresh}>{isSyncing ? '同步中…' : '同步'}</button>
      </header>

      <div className="stats-tabs" role="tablist" aria-label="统计视图">
        <button
          aria-selected={!isTeam && page === 'summary'}
          role="tab"
          type="button"
          onClick={() => changeMode('personal', 'summary')}
        >
          综合统计
        </button>
        <button
          aria-selected={!isTeam && page === 'daily'}
          role="tab"
          type="button"
          onClick={() => changeMode('personal', 'daily')}
        >
          每日明细
        </button>
        {isAdminUser ? (
          <button
            aria-selected={isTeam}
            role="tab"
            type="button"
            onClick={() => changeMode('team', 'summary')}
          >
            全员统计
          </button>
        ) : null}
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
          <button className="v" type="button" onClick={() => setPicker('month')}>{monthLabel}</button>
        </div>
        <div className="filter">
          <span className="k">{isTeam ? '范围' : '用户'}</span>
          {isTeam ? (
            <span className="v">{teamStats.people.length} 人</span>
          ) : isAdminUser ? (
            <button className="v" type="button" onClick={() => setPicker('person')}>
              {statsPerson.name}<span className="muted"> / {statsPerson.group}</span>
            </button>
          ) : (
            <span className="v">{statsPerson.name}<span className="muted"> / {statsPerson.group}</span></span>
          )}
        </div>
        <div className="filter">
          <span className="k">加班合计</span>
          <span className="v">{isTeam ? teamStats.people.reduce((total, person) => total + person.totalHours, 0) : personalStats.overtimeTotal} h</span>
        </div>
      </div>

      {isTeam ? (
        <>
          <div className="zones">
            <section className="page-section zone-wide">
              <div className="sec-head">
                <h2>全员加班分布</h2>
                <span className="sub">{teamStats.people.length} 人 · {monthLabel}结算周期</span>
              </div>
              <div className="team-trio">
                <div>
                  <div className="k">最高</div>
                  <div className="v">{teamStats.maxOvertime} h</div>
                </div>
                <div>
                  <div className="k">平均</div>
                  <div className="v">{teamStats.averageOvertime} h</div>
                </div>
                <div>
                  <div className="k">最低</div>
                  <div className="v">{teamStats.minOvertime} h</div>
                </div>
              </div>
            </section>

            <section className="page-section zone-wide">
              <div className="sec-head">
                <h2>排名</h2>
                <span className="sub">平日 1.5× · 特勤 2× · 法定 3×</span>
              </div>
              <div className="rank">
                {teamStats.ranking.map(person => (
                  <div className={person.rank <= 3 ? 'rank-row top' : 'rank-row'} key={person.personName}>
                    <span className="no">{String(person.rank).padStart(2, '0')}</span>
                    <span className="rank-name">
                      <b>{person.personName}</b>
                      <span>{person.group}</span>
                    </span>
                    <span className="rank-track">{rankSegments(person, teamMax)}</span>
                    <span className="total">{person.totalHours} h</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : page === 'summary' ? (
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
              {chartMax === 0 ? (
                <p className="bars-empty">本月没有加班记录</p>
              ) : (
                <div className="bars">
                  <div className="bars-plot">
                    {chartItems.map(item => (
                      <div className="col" key={item.type}>
                        <span className="v">{item.hours} h</span>
                        <span
                          className={item.type === '特勤' ? 'fill special' : item.type === '法定' ? 'fill legal' : 'fill'}
                          style={{ height: `${Math.max(3, (item.hours / chartMax) * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="bars-axis">
                    {chartItems.map(item => <span key={item.type}>{item.type}</span>)}
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
                  className={['daily-row', record.shift === '休息' ? 'is-rest' : '', record.overtimeHours > 0 ? 'has-overtime' : ''].filter(Boolean).join(' ')}
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
                  <span className={record.overtimeHours > 0 ? 'pay' : 'pay placeholder'}>
                    {record.overtimeHours > 0 ? `¥${formatMoney(pay)}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {picker ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setPicker(null)}>
          <section
            aria-label={picker === 'month' ? '选择月份' : '选择用户'}
            aria-modal="true"
            className="picker"
            role="dialog"
            onClick={event => event.stopPropagation()}
          >
            <header className="picker-head">
              <h2>{picker === 'month' ? '选择月份' : '选择用户'}</h2>
              <button className="act" type="button" onClick={() => setPicker(null)}>关闭</button>
            </header>
            <div className="picker-list">
              {picker === 'month'
                ? monthOptions.map(option => (
                  <button
                    aria-selected={option.value === selectedMonth}
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onMonthChange(option.value)
                      setPicker(null)
                    }}
                  >
                    <span>{option.label}</span>
                    <span className="tick" />
                  </button>
                ))
                : teamStats.people.map(person => (
                  <button
                    aria-selected={person.personName === statsPerson.name}
                    key={person.personName}
                    type="button"
                    onClick={() => {
                      onStatsPersonChange(person.personName)
                      setPicker(null)
                    }}
                  >
                    <span>{person.personName}<span className="muted"> · {person.group}</span></span>
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

function rankSegments(person: PersonOvertimeStats, max: number) {
  const parts = [
    { key: 'weekday', hours: person.weekdayHours },
    { key: 'special', hours: person.specialHours },
    { key: 'legal', hours: person.legalHours }
  ].filter(part => part.hours > 0)

  if (parts.length === 0) return <span className="muted">无加班</span>

  return parts.map(part => (
    <i
      className={part.key}
      key={part.key}
      style={{ width: `${(part.hours / max) * 100}%` }}
      title={`${part.hours} 小时`}
    >
      {part.hours / max > 0.14 ? part.hours : ''}
    </i>
  ))
}


