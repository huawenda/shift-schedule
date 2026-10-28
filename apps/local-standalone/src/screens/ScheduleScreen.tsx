import { MonthCalendar } from '../components/MonthCalendar'
import { SummaryBar } from '../components/SummaryBar'
import { TeamMatrix } from '../components/TeamMatrix'
import { formatPeriodRange, type Period } from '../data/period'
import { getRecordMap, type Member, type Roster } from '../data/roster'

export type ScheduleView = 'matrix' | 'calendar'

/** 从哪儿点开的格子：矩阵只能改班次，日历能记加班 */
export type EditSource = 'matrix' | 'calendar'

interface ScheduleScreenProps {
  roster: Roster
  period: Period
  view: ScheduleView
  selectedMemberId: string | null
  onViewChange: (view: ScheduleView) => void
  onSelectMember: (memberId: string) => void
  onEdit: (member: Member, date: string, source: EditSource) => void
}

export function ScheduleScreen({
  roster,
  period,
  view,
  selectedMemberId,
  onViewChange,
  onSelectMember,
  onEdit
}: ScheduleScreenProps) {
  const recordMap = getRecordMap(roster)
  const selectedMember = roster.members.find(member => member.id === selectedMemberId) ?? roster.members[0] ?? null

  return (
    <div className="canvas">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">排班</h1>
          <p className="canvas-sub">
            {formatPeriodRange(period)} · 共 {period.dates.length} 天 · {roster.members.length} 位成员
          </p>
        </div>

        <div className="canvas-tools">
          {view === 'calendar' && roster.members.length > 0 ? (
            <select
              aria-label="查看谁的月历"
              className="input input-compact"
              value={selectedMember?.id ?? ''}
              onChange={event => onSelectMember(event.target.value)}
            >
              {roster.members.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          ) : null}

          <div className="segmented" role="group" aria-label="视图切换">
            <button
              aria-pressed={view === 'matrix'}
              className={`segmented-item${view === 'matrix' ? ' is-on' : ''}`}
              type="button"
              onClick={() => onViewChange('matrix')}
            >
              全员矩阵
            </button>
            <button
              aria-pressed={view === 'calendar'}
              className={`segmented-item${view === 'calendar' ? ' is-on' : ''}`}
              type="button"
              onClick={() => onViewChange('calendar')}
            >
              个人日历
            </button>
          </div>
        </div>
      </div>

      <SummaryBar period={period} roster={roster} />

      {view === 'matrix' ? (
        <TeamMatrix
          period={period}
          roster={roster}
          selectedMemberId={selectedMember?.id ?? null}
          onEdit={(member, date) => onEdit(member, date, 'matrix')}
          onSelectMember={onSelectMember}
        />
      ) : (
        <MonthCalendar
          member={selectedMember}
          onEdit={(member, date) => onEdit(member, date, 'calendar')}
          period={period}
          recordMap={recordMap}
          roster={roster}
        />
      )}
    </div>
  )
}
