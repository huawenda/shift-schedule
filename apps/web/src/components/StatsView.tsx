import { useRef, useState } from 'react'
import {
  type AllPeopleMonthlyOvertimeStats,
  calculateOvertimePay,
  formatMoney,
  type OvertimeChartItem,
  type PersonMonthlyStats,
  type SalaryCalculation,
  scheduleData,
  type SalaryInputValues,
  type ScheduleMonth,
  type ShiftType
} from '@shift-schedule/core'
import type { SalaryInputField, SalarySaveStatus, StatsViewMode } from '../appTypes'
import { formatOvertimeHours, getShiftClassName } from '../scheduleHelpers'
import { formatDateForDisplay, monthOptions } from '../appConstants'

interface PersonSchedule {
  group: string
  name: string
  shifts: ShiftType[]
}

interface StatsViewProps {
  isAdminUser: boolean
  isSyncing: boolean
  monthEndDate: string
  monthStartDate: string
  overtimeChartItems: OvertimeChartItem[]
  overtimeChartMax: number
  personalStats: PersonMonthlyStats | null
  salaryCalculation: SalaryCalculation
  salaryInputs: SalaryInputValues
  salarySaveStatus: SalarySaveStatus
  selectedMonth: ScheduleMonth
  statsPerson: PersonSchedule
  statsViewMode: StatsViewMode
  teamChartMax: number
  teamStats: AllPeopleMonthlyOvertimeStats
  onBack: () => void
  onMonthChange: (month: ScheduleMonth) => void
  onRefresh: () => void
  onSalaryInputChange: (field: SalaryInputField, value: string) => void
  onStatsPersonChange: (personName: string) => void
  onStatsViewModeChange: (mode: StatsViewMode) => void
}

type PersonalPage = 0 | 1
type TouchPoint = { x: number; y: number }

export function StatsView({
  isAdminUser,
  isSyncing,
  monthEndDate,
  monthStartDate,
  overtimeChartItems,
  overtimeChartMax,
  personalStats,
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  selectedMonth,
  statsPerson,
  statsViewMode,
  teamChartMax,
  teamStats,
  onBack,
  onMonthChange,
  onRefresh,
  onSalaryInputChange,
  onStatsPersonChange,
  onStatsViewModeChange
}: StatsViewProps) {
  const [personalPage, setPersonalPage] = useState<PersonalPage>(0)
  const touchStart = useRef<TouchPoint | null>(null)

  function switchToPersonal() {
    onStatsViewModeChange('personal')
    setPersonalPage(0)
  }

  function switchToDaily() {
    onStatsViewModeChange('personal')
    setPersonalPage(1)
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) <= 64 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.35) return

    setPersonalPage(deltaX < 0 ? 1 : 0)
  }

  return (
    <section className="stats-page-mini">
      <header className="stats-mini-header">
        <button className="stats-back-button" type="button" onClick={onBack}>返回</button>
        <div className="stats-header-copy">
          <h1>统计</h1>
          <p>{formatDateForDisplay(monthStartDate)} - {formatDateForDisplay(monthEndDate)}</p>
        </div>
        <button className={`stats-sync-button ${isSyncing ? 'loading' : ''}`} type="button" disabled={isSyncing} onClick={onRefresh}>
          {isSyncing ? '同步中' : '同步'}
        </button>
      </header>

      <div className="stats-view-tabs">
        {isAdminUser ? (
          <>
            <button className={`stats-view-tab ${statsViewMode === 'personal' ? 'active' : ''}`} type="button" onClick={switchToPersonal}>
              个人统计
            </button>
            <button className={`stats-view-tab ${statsViewMode === 'team' ? 'active' : ''}`} type="button" onClick={() => onStatsViewModeChange('team')}>
              全员统计
            </button>
          </>
        ) : (
          <>
            <button className={`stats-view-tab ${statsViewMode === 'personal' && personalPage === 0 ? 'active' : ''}`} type="button" onClick={switchToPersonal}>
              综合统计
            </button>
            <button className={`stats-view-tab ${statsViewMode === 'personal' && personalPage === 1 ? 'active' : ''}`} type="button" onClick={switchToDaily}>
              每日明细
            </button>
          </>
        )}
      </div>

      <div className={`stats-filter-card ${statsViewMode === 'personal' ? 'has-person-filter' : ''}`}>
        <label className="stats-filter-item">
          <span className="stats-filter-label">月份</span>
          <select className="stats-filter-select" value={selectedMonth} onChange={event => onMonthChange(event.target.value as ScheduleMonth)}>
            {monthOptions.map(month => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
        </label>
        {statsViewMode === 'personal' ? (
          <label className="stats-filter-item">
            <span className="stats-filter-label">用户</span>
            {isAdminUser ? (
              <select className="stats-filter-select" value={statsPerson.name} onChange={event => onStatsPersonChange(event.target.value)}>
                {scheduleData.people.map(person => (
                  <option key={person.name} value={person.name}>{person.name} / {person.group}</option>
                ))}
              </select>
            ) : (
              <strong className="stats-filter-value">{statsPerson.name} / {statsPerson.group}</strong>
            )}
          </label>
        ) : null}
      </div>

      {isAdminUser && statsViewMode === 'personal' ? (
        <div className="stats-page-indicator">
          {[0, 1].map(index => (
            <button
              aria-label={`第 ${index + 1} 页`}
              className={`stats-page-indicator-dot ${personalPage === index ? 'active' : ''}`}
              key={index}
              type="button"
              onClick={() => setPersonalPage(index as PersonalPage)}
            />
          ))}
        </div>
      ) : null}

      {statsViewMode === 'personal' && personalStats ? (
        <div className="stats-personal-pages" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="stats-personal-track" style={{ transform: `translate3d(-${personalPage * 50}%, 0, 0)` }}>
            <div className="stats-personal-page">
              <PersonalSummary
                overtimeChartItems={overtimeChartItems}
                overtimeChartMax={overtimeChartMax}
                personalStats={personalStats}
                salaryCalculation={salaryCalculation}
                salaryInputs={salaryInputs}
                salarySaveStatus={salarySaveStatus}
                statsPerson={statsPerson}
                onSalaryInputChange={onSalaryInputChange}
              />
            </div>
            <div className="stats-personal-page">
              <DailyDetails
                monthEndDate={monthEndDate}
                monthStartDate={monthStartDate}
                personalStats={personalStats}
                salaryInputs={salaryInputs}
              />
            </div>
          </div>
        </div>
      ) : null}

      {statsViewMode === 'team' && isAdminUser ? (
        <TeamStatsSections teamChartMax={teamChartMax} teamStats={teamStats} />
      ) : null}
    </section>
  )
}

function PersonalSummary({
  overtimeChartItems,
  overtimeChartMax,
  personalStats,
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  statsPerson,
  onSalaryInputChange
}: {
  overtimeChartItems: OvertimeChartItem[]
  overtimeChartMax: number
  personalStats: PersonMonthlyStats
  salaryCalculation: SalaryCalculation
  salaryInputs: SalaryInputValues
  salarySaveStatus: SalarySaveStatus
  statsPerson: PersonSchedule
  onSalaryInputChange: (field: SalaryInputField, value: string) => void
}) {
  return (
    <div className="stats-content-inner">
      <section className="stats-card">
        <div className="stats-section-title-row">
          <div>
            <span className="stats-person-label">{statsPerson.name} / {statsPerson.group}</span>
            <h2 className="stats-section-title">月度概览</h2>
          </div>
          <span className="stats-section-hint">加班 {formatOvertimeHours(personalStats.overtimeTotal)} 小时</span>
        </div>
        <MonthlyOverview personalStats={personalStats} />
      </section>

      <section className="stats-card">
        <div className="stats-section-title-row">
          <h2 className="stats-section-title">加班分布</h2>
          <span className="stats-section-hint">按类型统计</span>
        </div>
        <OvertimeChart overtimeChartItems={overtimeChartItems} overtimeChartMax={overtimeChartMax} />
      </section>

      <SalarySection
        salaryCalculation={salaryCalculation}
        salaryInputs={salaryInputs}
        salarySaveStatus={salarySaveStatus}
        onSalaryInputChange={onSalaryInputChange}
      />
    </div>
  )
}

function MonthlyOverview({ personalStats }: { personalStats: PersonMonthlyStats }) {
  return (
    <div className="stats-overview-table">
      <div className="stats-overview-row stats-overview-header">
        <span>项目</span>
        <span>天数</span>
        <span>小时</span>
      </div>
      {getMonthlyOverviewRows(personalStats).map(row => (
        <div className="stats-overview-row" key={row.label}>
          <div className="stats-overview-name">
            <span className={`stats-overview-tag ${row.className}`}>{row.label}</span>
          </div>
          <strong className="stats-overview-value">{row.days}</strong>
          <strong className={`stats-overview-value ${row.hours > 0 ? 'active' : ''}`}>{formatOvertimeHours(row.hours)}h</strong>
        </div>
      ))}
    </div>
  )
}

function OvertimeChart({
  overtimeChartItems,
  overtimeChartMax
}: {
  overtimeChartItems: OvertimeChartItem[]
  overtimeChartMax: number
}) {
  return (
    <div className="stats-bar-chart">
      {overtimeChartItems.map(item => {
        const barHeight = overtimeChartMax > 0
          ? Math.max((item.hours / overtimeChartMax) * 100, item.hours > 0 ? 8 : 0)
          : 0

        return (
          <div className="stats-bar-item" key={item.type}>
            <span className={`stats-bar-value ${item.hours > 0 ? 'active' : ''}`}>{formatOvertimeHours(item.hours)}h</span>
            <div className="stats-bar-track">
              <span className={`stats-bar-fill ${getStatsChartTypeClassName(item.type)}`} style={{ height: `${barHeight}%` }} />
            </div>
            <span className="stats-bar-label">{item.type}</span>
          </div>
        )
      })}
    </div>
  )
}

function SalarySection({
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  onSalaryInputChange
}: {
  salaryCalculation: SalaryCalculation
  salaryInputs: SalaryInputValues
  salarySaveStatus: SalarySaveStatus
  onSalaryInputChange: (field: SalaryInputField, value: string) => void
}) {
  const salarySaveStatusLabel = salarySaveStatus === 'pending'
    ? '待保存'
    : salarySaveStatus === 'saving'
      ? '保存中'
      : salarySaveStatus === 'saved'
        ? '已保存'
        : salarySaveStatus === 'error'
          ? '保存失败'
          : ''

  return (
    <section className="stats-card salary-card">
      <div className="stats-section-title-row salary-title-row">
        <h2 className="stats-section-title">薪资计算</h2>
        {salarySaveStatusLabel ? <span className={`salary-save-status ${salarySaveStatus}`}>{salarySaveStatusLabel}</span> : null}
      </div>

      <div className="salary-section">
        <div className="salary-section-head">
          <h3 className="salary-block-title">基本项</h3>
          <span className="salary-section-total">小计 ¥{formatMoney(salaryCalculation.basicPayTotal)}</span>
        </div>
        <div className="salary-input-grid">
          <SalaryInput label="底薪" field="baseSalary" value={salaryInputs.baseSalary} onChange={onSalaryInputChange} />
          <SalaryInput label="绩效津贴" field="performanceAllowance" value={salaryInputs.performanceAllowance} onChange={onSalaryInputChange} />
          <SalaryInput label="岗位津贴" field="positionAllowance" value={salaryInputs.positionAllowance} onChange={onSalaryInputChange} />
        </div>
        <span className="salary-rate-line">时薪 ¥{formatMoney(salaryCalculation.hourlyWage)}</span>
      </div>

      <div className="salary-section">
        <div className="salary-section-head">
          <h3 className="salary-block-title">加班工资</h3>
          <span className="salary-section-total">小计 ¥{formatMoney(salaryCalculation.overtimePayTotal)}</span>
        </div>
        <div className="salary-result-grid">
          <SalaryResult label="平日加班" value={`¥${formatMoney(salaryCalculation.weekdayOvertimePay)}`} />
          <SalaryResult label="周末加班" value={`¥${formatMoney(salaryCalculation.specialOvertimePay)}`} />
          <SalaryResult label="法定加班" value={`¥${formatMoney(salaryCalculation.legalOvertimePay)}`} variant="legal" />
        </div>
      </div>

      <div className="salary-section">
        <div className="salary-section-head">
          <h3 className="salary-block-title">扣款项</h3>
          <span className="salary-section-total deduction">小计 ¥{formatMoney(salaryCalculation.deductionTotal)}</span>
        </div>
        <div className="salary-deduction-grid">
          <SalaryResult label="事假扣款" value={`¥${formatMoney(salaryCalculation.leaveDeduction)}`} variant="deduction" />
          <SalaryInput label="其他扣款" field="otherDeductions" value={salaryInputs.otherDeductions} onChange={onSalaryInputChange} />
        </div>
      </div>

      <div className="salary-section salary-summary-section">
        <div className="salary-section-head">
          <h3 className="salary-block-title">汇总</h3>
        </div>
        <div className="salary-final-grid">
          <div className="salary-summary-item">
            <span className="salary-summary-label">应付工资</span>
            <strong className="salary-summary-value">¥{formatMoney(salaryCalculation.payableSalary)}</strong>
          </div>
          <div className="salary-summary-item primary">
            <span className="salary-summary-label">实付工资</span>
            <strong className="salary-summary-value">¥{formatMoney(salaryCalculation.netSalary)}</strong>
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
    <label className="salary-input-item">
      <span className="salary-input-label">{label}</span>
      <span className="salary-input-box">
        <span className="salary-input-prefix">¥</span>
        <input
          className="salary-input"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={event => onChange(field, event.target.value)}
        />
      </span>
    </label>
  )
}

function SalaryResult({
  label,
  value,
  variant = ''
}: {
  label: string
  value: string
  variant?: 'legal' | 'deduction' | ''
}) {
  return (
    <div className={`salary-result-item ${variant}`}>
      <span className="salary-result-label">{label}</span>
      <strong className="salary-result-value">{value}</strong>
    </div>
  )
}

function DailyDetails({
  monthEndDate,
  monthStartDate,
  personalStats,
  salaryInputs
}: {
  monthEndDate: string
  monthStartDate: string
  personalStats: PersonMonthlyStats
  salaryInputs: SalaryInputValues
}) {
  return (
    <div className="stats-content-inner">
      <section className="stats-card">
        <div className="stats-section-title-row">
          <h2 className="stats-section-title">每日明细</h2>
          <span className="stats-section-hint">{monthStartDate.slice(5)} - {monthEndDate.slice(5)}</span>
        </div>
        <div className="stats-daily-list">
          <div className="stats-daily-row stats-daily-header">
            <span>日期</span>
            <span>班次</span>
            <span>金额</span>
            <span>小时</span>
          </div>
          {personalStats.dailyRecords.map(record => {
            const dailyOvertimePay = calculateOvertimePay(
              salaryInputs,
              record.overtimeHours,
              getDailyOvertimeMultiplier(record)
            )

            return (
              <div className={`stats-daily-row ${record.overtimeHours > 0 ? 'has-overtime' : ''}`} key={record.date}>
                <span className="stats-daily-date">{record.date}</span>
                <span className="stats-daily-shift-cell">
                  <span className={`stats-shift ${getStatsShiftClassName(record.shift)} ${record.isLegal ? 'has-legal' : ''}`}>
                    {record.isLegal ? <span className="stats-legal-shift-badge">法</span> : null}
                    {record.shift}
                  </span>
                </span>
                <strong className={`stats-daily-pay ${getDailyPayClassName(record)} ${record.overtimeHours > 0 ? '' : 'placeholder'}`}>
                  {record.overtimeHours > 0 ? `+${formatMoney(dailyOvertimePay)}` : '+0.00'}
                </strong>
                <strong className={`stats-daily-overtime ${record.overtimeHours > 0 ? 'active' : ''}`}>
                  {record.overtimeHours > 0 ? `${formatOvertimeHours(record.overtimeHours)}h` : '0h'}
                </strong>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function TeamStatsSections({
  teamChartMax,
  teamStats
}: {
  teamChartMax: number
  teamStats: AllPeopleMonthlyOvertimeStats
}) {
  return (
    <div className="stats-content-inner">
      <section className="stats-card">
        <div className="stats-section-title-row">
          <h2 className="stats-section-title">全员概览</h2>
          <span className="stats-section-hint">共 {teamStats.people.length} 人</span>
        </div>
        <div className="stats-team-overview-grid">
          <div className="stats-team-overview-item">
            <strong>{formatOvertimeHours(teamStats.maxOvertime)}h</strong>
            <span>最高</span>
          </div>
          <div className="stats-team-overview-item">
            <strong>{formatOvertimeHours(teamStats.minOvertime)}h</strong>
            <span>最低</span>
          </div>
          <div className="stats-team-overview-item">
            <strong>{formatOvertimeHours(teamStats.averageOvertime)}h</strong>
            <span>平均</span>
          </div>
        </div>
      </section>

      <section className="stats-card">
        <div className="stats-section-title-row">
          <h2 className="stats-section-title">加班排名</h2>
          <span className="stats-section-hint">平日 / 特勤 / 法定</span>
        </div>
        <div className="stats-team-legend">
          <span className="stats-team-legend-item weekday">平日</span>
          <span className="stats-team-legend-item special">特勤</span>
          <span className="stats-team-legend-item legal">法定</span>
        </div>
        <div className="stats-team-chart">
          {teamStats.ranking.map(person => (
            <div className="stats-team-chart-row" key={person.personName}>
              <strong className={`stats-ranking-rank ${person.rank <= 3 ? 'top' : ''}`}>{person.rank}</strong>
              <div className="stats-team-chart-person">
                <span className="stats-team-chart-name">{person.personName}</span>
                <span className="stats-team-chart-group">{person.group}</span>
              </div>
              <div className="stats-team-chart-track">
                {getOvertimeStackSegments(person, teamChartMax).map(segment => (
                  <span className={`stats-team-chart-segment ${segment.className}`} key={segment.key} style={{ width: `${segment.width}%` }}>
                    {segment.showLabel ? <span>{formatOvertimeHours(segment.hours)}h</span> : null}
                  </span>
                ))}
              </div>
              <strong className="stats-team-chart-total">{formatOvertimeHours(person.totalHours)}h</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function getMonthlyOverviewRows(stats: PersonMonthlyStats) {
  return [
    { label: '白班', className: 'stats-shift-day', days: stats.shiftSummary.白班, hours: stats.shiftSummary.加班?.白班 ?? 0 },
    { label: '夜班', className: 'stats-shift-night', days: stats.shiftSummary.夜班, hours: stats.shiftSummary.加班?.夜班 ?? 0 },
    { label: '休息', className: 'stats-shift-rest', days: stats.shiftSummary.休息, hours: 0 },
    { label: '白特', className: 'stats-shift-special-day', days: stats.shiftSummary.白特, hours: stats.shiftSummary.加班?.白特 ?? 0 },
    { label: '夜特', className: 'stats-shift-special-night', days: stats.shiftSummary.夜特, hours: stats.shiftSummary.加班?.夜特 ?? 0 },
    { label: '法定', className: 'stats-shift-legal', days: stats.shiftSummary.法定 ?? 0, hours: stats.shiftSummary.加班?.法定 ?? 0 },
    { label: '事假', className: 'stats-shift-leave', days: stats.leaveSummary.days, hours: stats.leaveSummary.hours }
  ]
}

function getOvertimeStackSegments(person: AllPeopleMonthlyOvertimeStats['ranking'][number], maxHours: number) {
  return [
    { key: 'weekday', className: 'stats-overtime-weekday', hours: person.weekdayHours },
    { key: 'special', className: 'stats-overtime-special', hours: person.specialHours },
    { key: 'legal', className: 'stats-overtime-legal', hours: person.legalHours }
  ].map(segment => ({
    ...segment,
    width: maxHours > 0 ? Math.max((segment.hours / maxHours) * 100, segment.hours > 0 ? 8 : 0) : 0,
    showLabel: segment.hours > 0
  }))
}

function getDailyOvertimeMultiplier(record: { shift: ShiftType; isLegal?: boolean }): number {
  if (record.isLegal) return 3
  if (record.shift === '白特' || record.shift === '夜特') return 2
  if (record.shift === '白班' || record.shift === '夜班') return 1.5

  return 0
}

function getDailyPayClassName(record: { shift: ShiftType; isLegal?: boolean }): string {
  if (record.isLegal) return 'legal'
  if (record.shift === '白特' || record.shift === '夜特') return 'special'

  return ''
}

function getStatsShiftClassName(shift: ShiftType): string {
  return {
    白班: 'stats-shift-day',
    夜班: 'stats-shift-night',
    休息: 'stats-shift-rest',
    白特: 'stats-shift-special-day',
    夜特: 'stats-shift-special-night',
    事假: 'stats-shift-leave'
  }[shift]
}

function getStatsChartTypeClassName(type: string): string {
  return {
    平日: 'stats-overtime-weekday',
    特勤: 'stats-overtime-special',
    法定: 'stats-overtime-legal'
  }[type] ?? ''
}
