import { useState, type ReactNode } from 'react'
import {
  calculateOvertimePay,
  type DailyAttendanceRecord,
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
import { formatMoney, formatOvertimeHours, canRecordOvertime } from '../../scheduleHelpers'

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
            <div className="panel stats-fill">
              <div className="section-head">
                <h2 className="section-title">每日明细</h2>
                <span className="section-meta">{personalStats.dailyRecords.length} 条</span>
              </div>
              <DailyDetails
                personalStats={personalStats}
                salaryInputs={salaryInputs}
                monthStartDate={monthStartDate}
              />
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

      {/* 四个块包一层：窄屏时内部退回单列（见 .salary-blocks），
          宽屏上并成 2×2，把这一区从 564px 压到约 300px。
          之前四块是 section 的直接子元素，只能竖着排 ——
          而面板有 717px 宽，实测横向空着一半。 */}
      <div className="salary-blocks">
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
  salaryInputs,
  monthStartDate
}: {
  personalStats: PersonMonthlyStats
  salaryInputs: SalaryInputValues
  monthStartDate: string
}) {
  const records = Array.from(
    new Map(personalStats.dailyRecords.map(record => [record.date, record])).values()
  )
  const year = Number(monthStartDate.slice(0, 4))

  /* 月历网格：一个结算周期恒为 30 天（20 号–次月 19 号），补齐首尾空位后
     最多 6 行 × 7 列。30 天一次看全，不再纵向滚动 960px。 */
  const leadingCount = records.length > 0 ? weekdayIndexOf(records[0].date, year) : 0
  const trailingCount = (7 - ((leadingCount + records.length) % 7)) % 7
  const cells: Array<typeof records[number] | null> = [
    ...Array.from({ length: leadingCount }, () => null),
    ...records,
    ...Array.from({ length: trailingCount }, () => null)
  ]

  /* 合计与上面的「按班次汇总」必须用同一条筛选规则，否则两处对不上：
     实测种子数据里有一条休息日带 3h 加班，合计算了它（18.5h），
     汇总不算它（15.5h），同一页上两个数打架。 */
  const payableRecords = records.filter(record => canRecordOvertime(record.shift) && record.overtimeHours > 0)
  const totalHours = payableRecords.reduce((total, record) => total + record.overtimeHours, 0)
  const totalPay = payableRecords.reduce(
    (total, record) => total + calculateOvertimePay(salaryInputs, record.overtimeHours, multiplierOf(record)),
    0
  )

  return (
    <div className="daily">
      <div className="daily-grid-wrap">
        <div className="daily-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map(day => (
            <span className="daily-weekday" key={day}>{day}</span>
          ))}
        </div>

        <div className="daily-grid">
          {cells.map((record, index) => (
            record ? (
              <DailyCell
                hours={record.overtimeHours}
                isLegal={record.isLegal === true}
                key={record.date}
                pay={calculateOvertimePay(salaryInputs, record.overtimeHours, multiplierOf(record))}
                record={record}
                today={record.date === todayDate()}
              />
            ) : (
              <div className="daily-cell is-blank" key={`blank-${index}`} aria-hidden="true" />
            )
          ))}
        </div>
      </div>

      <ShiftBreakdown records={records} salaryInputs={salaryInputs} />

      <footer className="daily-foot">
        <span className="daily-foot-item">
          <span className="daily-foot-key">加班合计</span>
          <strong className="daily-foot-value">{formatOvertimeHours(totalHours)}h</strong>
        </span>
        <span className="daily-foot-item">
          <span className="daily-foot-key">金额合计</span>
          <strong className="daily-foot-value">¥{formatMoney(totalPay)}</strong>
        </span>
        <span className="daily-foot-item">
          <span className="daily-foot-key">加班天数</span>
          <strong className="daily-foot-value">
            {payableRecords.length} / {records.length} 天
          </strong>
        </span>
      </footer>
    </div>
  )
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 明细表只回答「哪一天」，回答不了「这个月一共上了几个白班、
 *  加班都摊在哪一班上」——这些问题以前得切回月度概览去找。
 *  网格在宽屏上必然多出高度，与其让格子空着，不如把这块高度
 *  换成一张按班次归拢的汇总：一眼看完，不必来回切标签页。 */function ShiftBreakdown({
  records,
  salaryInputs
}: {
  records: DailyAttendanceRecord[]
  salaryInputs: SalaryInputValues
}) {
  /* 这张表只回答「加班的时间和钱摊在哪一班上」，两行都不合格就不该出现：
     - 休息 / 事假：这两班根本不产生加班（App 在保存时就把小时数清零，
       这里直接复用同一条判定 canRecordOvertime，不另写一份名单，
       免得以后加班规则改了、这张表还按老名单筛）；
     - 白班 / 夜班：能产生加班，但本月一次都没加。
     休息天数、月度概览里都数得到，不需要在这里占一行。 */
  const groups = new Map<ShiftType, { days: number; hours: number; pay: number }>()

  records.forEach(record => {
    if (!canRecordOvertime(record.shift)) return
    const current = groups.get(record.shift) ?? { days: 0, hours: 0, pay: 0 }
    groups.set(record.shift, {
      days: current.days + 1,
      hours: current.hours + record.overtimeHours,
      pay: current.pay + calculateOvertimePay(salaryInputs, record.overtimeHours, multiplierOf(record))
    })
  })

  const rows = SHIFT_ORDER
    .map(shift => ({ shift, ...(groups.get(shift) ?? { days: 0, hours: 0, pay: 0 }) }))
    .filter(row => row.hours > 0)
  const maxHours = Math.max(...rows.map(row => row.hours), 1)

  if (rows.length === 0) {
    return (
      <section className="daily-breakdown is-empty">
        <div className="section-head">
          <h3 className="daily-breakdown-title">按班次汇总</h3>
        </div>
        <p className="daily-breakdown-empty">本月没有加班记录。</p>
      </section>
    )
  }

  return (
    <section className="daily-breakdown">
      <div className="section-head">
        <h3 className="daily-breakdown-title">按班次汇总</h3>
        <span className="section-meta">{rows.length} 类</span>
      </div>
      <ul className="breakdown-list">
        {rows.map(row => (
          <li className="breakdown-item" key={row.shift}>
            <span className={`breakdown-shift ${shiftClass(row.shift)}`}>{row.shift}</span>
            <span className="breakdown-bar">
              <span className="breakdown-fill" style={{ width: `${(row.hours / maxHours) * 100}%` }} />
            </span>
            <span className="breakdown-days">{row.days} 天</span>
            <span className="breakdown-hours">{formatOvertimeHours(row.hours)}h</span>
            <span className="breakdown-pay">¥{formatMoney(row.pay)}</span>
            <span className="breakdown-pad" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </section>
  )
}

const SHIFT_ORDER: ShiftType[] = ['白班', '夜班', '白特', '夜特', '事假', '休息']

function DailyCell({
  hours,
  isLegal,
  pay,
  record,
  today
}: {
  hours: number
  isLegal: boolean
  pay: number
  record: DailyAttendanceRecord
  today: boolean
}) {
  /* isZero 同时覆盖「没有加班」和「这一班根本不产生加班」两种情况 ——
     休息日挂着 3h / ¥xxx 是没有意义的显示，存档里的脏数据不该
     渲染成一个看起来合法的小时数。 */
  const isZero = hours <= 0 || !canRecordOvertime(record.shift)
  const multiplier = multiplierOf(record)
  const specialClass = record.shift === '白特'
    ? 'is-special-day'
    : record.shift === '夜特' ? 'is-special-night' : ''

  return (
    <div
      className={`daily-cell ${specialClass} ${today ? 'is-today' : ''} ${isZero ? 'is-zero' : ''}`}
    >
      <span className="daily-cell-when">
        <span className="daily-cell-date">{record.date}</span>
        {isZero ? null : (
          <span className={`daily-cell-mult ${isLegal ? 'is-legal' : multiplier === 2 ? 'is-special' : ''}`}>
            ×{multiplier === 1.5 ? '1.5' : multiplier}
          </span>
        )}
      </span>

      <span className={`daily-cell-shift ${shiftClass(record.shift)}`}>{record.shift}</span>

      {isZero ? null : (
        <span className="daily-cell-foot">
          <span className="daily-cell-hours">{formatOvertimeHours(hours)}h</span>
          <span className="daily-cell-pay">¥{formatMoney(pay)}</span>
        </span>
      )}
    </div>
  )
}

function weekdayIndexOf(date: string, year: number): number {
  const month = Number(date.slice(0, 2))
  const day = Number(date.slice(3, 5))
  return new Date(year, month - 1, day).getDay()
}

function todayDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}/${day}`
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