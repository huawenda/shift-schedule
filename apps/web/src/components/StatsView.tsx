import {
  type AllPeopleMonthlyOvertimeStats,
  calculateOvertimePay,
  formatMoney,
  type OvertimeChartItem,
  type PersonMonthlyStats,
  type SalaryCalculation,
  scheduleData,
  type SalaryInputValues,
  type ShiftType
} from '@shift-schedule/core'
import type { ReactNode } from 'react'
import type { SalaryInputField, SalarySaveStatus, StatsViewMode } from '../appTypes'
import { formatOvertimeHours, getShiftClassName } from '../scheduleHelpers'

interface PersonSchedule {
  group: string
  name: string
  shifts: ShiftType[]
}

interface StatsViewProps {
  isAdminUser: boolean
  monthEndDate: string
  monthStartDate: string
  overtimeChartItems: OvertimeChartItem[]
  overtimeChartMax: number
  personalStats: PersonMonthlyStats | null
  salaryCalculation: SalaryCalculation
  salaryInputs: SalaryInputValues
  salarySaveStatus: SalarySaveStatus
  statsPerson: PersonSchedule
  statsViewMode: StatsViewMode
  teamChartMax: number
  teamStats: AllPeopleMonthlyOvertimeStats
  onSalaryInputChange: (field: SalaryInputField, value: string) => void
  onStatsPersonChange: (personName: string) => void
  onStatsViewModeChange: (mode: StatsViewMode) => void
}

export function StatsView({
  isAdminUser,
  monthEndDate,
  monthStartDate,
  overtimeChartItems,
  overtimeChartMax,
  personalStats,
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  statsPerson,
  statsViewMode,
  teamChartMax,
  teamStats,
  onSalaryInputChange,
  onStatsPersonChange,
  onStatsViewModeChange
}: StatsViewProps) {
  return (
    <section className="stats-view">
      <div className="stats-toolbar">
        <div className="stats-mode-tabs">
          <button className={statsViewMode === 'personal' ? 'active' : ''} type="button" onClick={() => onStatsViewModeChange('personal')}>
            个人统计
          </button>
          {isAdminUser ? (
            <button className={statsViewMode === 'team' ? 'active' : ''} type="button" onClick={() => onStatsViewModeChange('team')}>
              全员统计
            </button>
          ) : null}
        </div>
        {isAdminUser && statsViewMode === 'personal' ? (
          <label className="person-select">
            <span>用户</span>
            <select value={statsPerson.name} onChange={event => onStatsPersonChange(event.target.value)}>
              {scheduleData.people.map(person => (
                <option key={person.name} value={person.name}>{person.name} / {person.group}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {statsViewMode === 'personal' && personalStats ? (
        <PersonalStatsSections
          monthEndDate={monthEndDate}
          monthStartDate={monthStartDate}
          overtimeChartItems={overtimeChartItems}
          overtimeChartMax={overtimeChartMax}
          personalStats={personalStats}
          salaryCalculation={salaryCalculation}
          salaryInputs={salaryInputs}
          salarySaveStatus={salarySaveStatus}
          statsPerson={statsPerson}
          onSalaryInputChange={onSalaryInputChange}
        />
      ) : null}

      {statsViewMode === 'team' && isAdminUser ? (
        <TeamStatsSections teamChartMax={teamChartMax} teamStats={teamStats} />
      ) : null}
    </section>
  )
}

function PersonalStatsSections({
  monthEndDate,
  monthStartDate,
  overtimeChartItems,
  overtimeChartMax,
  personalStats,
  salaryCalculation,
  salaryInputs,
  salarySaveStatus,
  statsPerson,
  onSalaryInputChange
}: Omit<StatsViewProps, 'isAdminUser' | 'statsViewMode' | 'teamChartMax' | 'teamStats' | 'onStatsPersonChange' | 'onStatsViewModeChange'> & { personalStats: PersonMonthlyStats }) {
  return (
    <>
      <section className="stats-card">
        <div className="section-header">
          <div>
            <span className="muted-label">{statsPerson.name} / {statsPerson.group}</span>
            <h2>月度概览</h2>
          </div>
          <strong className="stats-total">加班 {formatOvertimeHours(personalStats.overtimeTotal)}h</strong>
        </div>
        <div className="overview-table">
          {[
            { label: '白班', value: personalStats.shiftSummary.白班, hours: personalStats.shiftSummary.加班?.白班 ?? 0, shift: '白班' as const },
            { label: '夜班', value: personalStats.shiftSummary.夜班, hours: personalStats.shiftSummary.加班?.夜班 ?? 0, shift: '夜班' as const },
            { label: '休息', value: personalStats.shiftSummary.休息, hours: 0, shift: '休息' as const },
            { label: '白特', value: personalStats.shiftSummary.白特, hours: personalStats.shiftSummary.加班?.白特 ?? 0, shift: '白特' as const },
            { label: '夜特', value: personalStats.shiftSummary.夜特, hours: personalStats.shiftSummary.加班?.夜特 ?? 0, shift: '夜特' as const },
            { label: '事假', value: personalStats.leaveSummary.days, hours: personalStats.leaveSummary.hours, shift: '事假' as const }
          ].map(row => (
            <div className="overview-row" key={row.label}>
              <span className={`shift-chip ${getShiftClassName(row.shift)}`}>{row.label}</span>
              <strong>{row.value}</strong>
              <span>{formatOvertimeHours(row.hours)}h</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stats-card">
        <div className="section-header">
          <h2>加班分布</h2>
          <span className="muted-label">按类型统计</span>
        </div>
        <div className="overtime-bars">
          {overtimeChartItems.map(item => {
            const width = overtimeChartMax > 0
              ? Math.max((item.hours / overtimeChartMax) * 100, item.hours > 0 ? 8 : 0)
              : 0

            return (
              <div className="overtime-bar-row" key={item.type}>
                <span>{item.type}</span>
                <div className="overtime-track">
                  <div className={`overtime-fill overtime-${item.type}`} style={{ width: `${width}%` }} />
                </div>
                <strong>{formatOvertimeHours(item.hours)}h</strong>
              </div>
            )
          })}
        </div>
      </section>

      <SalarySection
        salaryCalculation={salaryCalculation}
        salaryInputs={salaryInputs}
        salarySaveStatus={salarySaveStatus}
        onSalaryInputChange={onSalaryInputChange}
      />

      <section className="stats-card">
        <div className="section-header">
          <h2>每日明细</h2>
          <span className="muted-label">{monthStartDate.slice(5)} - {monthEndDate.slice(5)}</span>
        </div>
        <div className="daily-list">
          {personalStats.dailyRecords.map(record => {
            const dailyOvertimePay = calculateOvertimePay(
              salaryInputs,
              record.overtimeHours,
              getDailyOvertimeMultiplier(record)
            )

            return (
              <div className="daily-row" key={record.date}>
                <span>{record.date}</span>
                <span className={`shift-chip ${getShiftClassName(record.shift)}`}>{record.isLegal ? '法 ' : ''}{record.shift}</span>
                <strong>{record.overtimeHours > 0 ? `+${formatMoney(dailyOvertimePay)}` : '+0.00'}</strong>
                <span>{formatOvertimeHours(record.overtimeHours)}h</span>
              </div>
            )
          })}
        </div>
      </section>
    </>
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
  return (
    <section className="stats-card salary-card">
      <div className="section-header">
        <h2>薪资计算</h2>
        {salarySaveStatus !== 'idle' ? <span className={`salary-status ${salarySaveStatus}`}>{salarySaveStatus === 'saving' ? '保存中' : salarySaveStatus === 'saved' ? '已保存' : salarySaveStatus === 'error' ? '保存失败' : '待保存'}</span> : null}
      </div>
      <SalaryBlock title="基本项" total={`小计 ¥${formatMoney(salaryCalculation.basicPayTotal)}`}>
        <div className="salary-grid">
          {[
            { label: '底薪', field: 'baseSalary' as const },
            { label: '绩效津贴', field: 'performanceAllowance' as const },
            { label: '岗位津贴', field: 'positionAllowance' as const }
          ].map(item => (
            <label className="salary-input-item" key={item.field}>
              <span>{item.label}</span>
              <input
                inputMode="decimal"
                value={salaryInputs[item.field]}
                placeholder="0"
                onChange={event => onSalaryInputChange(item.field, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="salary-rate-line">时薪 ¥{formatMoney(salaryCalculation.hourlyWage)}</p>
      </SalaryBlock>

      <SalaryBlock title="加班工资" total={`小计 ¥${formatMoney(salaryCalculation.overtimePayTotal)}`}>
        <div className="salary-results">
          <div><span>平日加班</span><strong>¥{formatMoney(salaryCalculation.weekdayOvertimePay)}</strong></div>
          <div><span>周末加班</span><strong>¥{formatMoney(salaryCalculation.specialOvertimePay)}</strong></div>
          <div className="legal"><span>法定加班</span><strong>¥{formatMoney(salaryCalculation.legalOvertimePay)}</strong></div>
        </div>
      </SalaryBlock>

      <SalaryBlock title="扣款项" total={`小计 ¥${formatMoney(salaryCalculation.deductionTotal)}`}>
        <div className="salary-results salary-deduction-grid">
          <div className="deduction"><span>事假扣款</span><strong>¥{formatMoney(salaryCalculation.leaveDeduction)}</strong></div>
          <label className="salary-input-item">
            <span>其他扣款</span>
            <input
              inputMode="decimal"
              value={salaryInputs.otherDeductions}
              placeholder="0"
              onChange={event => onSalaryInputChange('otherDeductions', event.target.value)}
            />
          </label>
        </div>
      </SalaryBlock>

      <SalaryBlock title="汇总">
        <div className="salary-results salary-final-grid">
          <div><span>应付工资</span><strong>¥{formatMoney(salaryCalculation.payableSalary)}</strong></div>
          <div className="primary"><span>实付工资</span><strong>¥{formatMoney(salaryCalculation.netSalary)}</strong></div>
        </div>
      </SalaryBlock>
    </section>
  )
}

function SalaryBlock({
  children,
  title,
  total
}: {
  children: ReactNode
  title: string
  total?: string
}) {
  return (
    <div className="salary-section">
      <div className="salary-section-head">
        <h3>{title}</h3>
        {total ? <span>{total}</span> : null}
      </div>
      {children}
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
    <>
      <section className="stats-card">
        <div className="section-header">
          <h2>全员概览</h2>
          <span className="muted-label">共 {teamStats.people.length} 人</span>
        </div>
        <div className="team-summary-grid">
          <div><strong>{formatOvertimeHours(teamStats.maxOvertime)}h</strong><span>最高</span></div>
          <div><strong>{formatOvertimeHours(teamStats.averageOvertime)}h</strong><span>平均</span></div>
          <div><strong>{formatOvertimeHours(teamStats.minOvertime)}h</strong><span>最低</span></div>
        </div>
      </section>
      <section className="stats-card">
        <div className="section-header">
          <h2>加班排名</h2>
          <span className="muted-label">平日 / 特勤 / 法定</span>
        </div>
        <div className="team-ranking">
          {teamStats.ranking.map(person => (
            <div className="team-ranking-row" key={person.personName}>
              <strong className={person.rank <= 3 ? 'top-rank' : ''}>{person.rank}</strong>
              <div className="team-person">
                <span>{person.personName}</span>
                <small>{person.group}</small>
              </div>
              <div className="team-track">
                <span className="team-segment weekday" style={{ width: `${teamChartMax > 0 ? (person.weekdayHours / teamChartMax) * 100 : 0}%` }} />
                <span className="team-segment special" style={{ width: `${teamChartMax > 0 ? (person.specialHours / teamChartMax) * 100 : 0}%` }} />
                <span className="team-segment legal" style={{ width: `${teamChartMax > 0 ? (person.legalHours / teamChartMax) * 100 : 0}%` }} />
              </div>
              <span>{formatOvertimeHours(person.totalHours)}h</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function getDailyOvertimeMultiplier(record: { shift: ShiftType; isLegal?: boolean }): number {
  if (record.isLegal) return 3
  if (record.shift === '白特' || record.shift === '夜特') return 2
  if (record.shift === '白班' || record.shift === '夜班') return 1.5

  return 0
}
