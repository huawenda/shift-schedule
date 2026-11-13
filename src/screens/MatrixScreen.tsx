import { useEffect, useMemo } from 'react'
import { PeriodNav } from '../components/PeriodNav'
import { SummaryBar } from '../components/SummaryBar'
import { TeamMatrix, type MatrixMode } from '../components/TeamMatrix'
import { type Period } from '../data/period'
import { groupNameOf, membersOfGroup, type Member, type Roster } from '../data/roster'
import { useWorkdayKey } from '../hooks/useWorkdayKey'

interface MatrixScreenProps {
  roster: Roster
  period: Period
  /** 结算月导航（原在顶栏，现在落在页头左侧） */
  monthTitle: string
  atCurrentMonth: boolean
  onShiftMonth: (delta: number) => void
  onToday: () => void
  /** 视图切换与分组筛选由 App 持有，切到别的页再回来仍是上次的选择 */
  mode: MatrixMode
  onModeChange: (mode: MatrixMode) => void
  /** null = 全部；UNGROUPED = 未分组；其余是分组 id */
  groupFilter: string | null
  onGroupFilterChange: (groupFilter: string | null) => void
  onEdit: (member: Member, date: string) => void
}

/** 「未分组」不是一个真实的组，用哨兵值表达筛选条件 */
const UNGROUPED = '__ungrouped__'

/**
 * 全员矩阵：只讲「全组」的事。
 *
 * 顶部那 3 格概览（今日白班/夜班/休息，白特与夜特并入对应班次）放在这一页而不是日历页 ——
 * 它统计的是全员出勤，与矩阵同源；日历页只讲本人。
 *
 * 视图切换（按班次 / 按姓名）与分组筛选都由 App 持有：离开这一页再回来
 * 保持上次的选择，但**不落存储** —— 刷新应用才回到默认。
 *
 * 分组筛选不是独立页面，也不改变行顺序 —— 只是把 roster.members 过滤成当前组。
 */
export function MatrixScreen({
  roster,
  period,
  monthTitle,
  atCurrentMonth,
  onShiftMonth,
  onToday,
  mode,
  onModeChange,
  groupFilter,
  onGroupFilterChange,
  onEdit
}: MatrixScreenProps) {
  /**
   * 矩阵与概览条的「今天」跟本人的班走：夜班跨零点时，
   * 00:00–08:00 仍标在夜班开始那天，08:00 才切到新一天。
   */
  const workday = useWorkdayKey(roster)

  const ungroupedCount = roster.members.filter(member => !member.groupId).length

  // 分组被删、或「未分组」已经没人时，自动退回「全部」，不让筛选停在空集合上
  useEffect(() => {
    if (!groupFilter) return
    if (groupFilter === UNGROUPED) {
      if (ungroupedCount === 0) onGroupFilterChange(null)
      return
    }
    if (!roster.groups.some(group => group.id === groupFilter)) onGroupFilterChange(null)
  }, [groupFilter, onGroupFilterChange, roster.groups, ungroupedCount])

  const visibleMembers = useMemo(
    () => (groupFilter === UNGROUPED
      ? roster.members.filter(member => !member.groupId)
      : membersOfGroup(roster, groupFilter)),
    [groupFilter, roster]
  )

  /** 过滤后的花名册：概览条与矩阵都只看当前组的人 */
  const viewRoster = useMemo<Roster>(
    () => (groupFilter === null ? roster : { ...roster, members: visibleMembers }),
    [groupFilter, roster, visibleMembers]
  )

  const groupLabel = groupFilter === UNGROUPED
    ? '未分组'
    : groupFilter
      ? groupNameOf(roster, groupFilter)
      : ''
  const groupEmpty = groupFilter !== null && visibleMembers.length === 0

  return (
    <div className="canvas is-matrix is-pinned">
      {/*
        页头一行三段：月份导航靠左、分组胶囊居中、视图切换靠右。
      */}
      <div className="canvas-head">

        <div className="matrix-period">
          <PeriodNav
            atCurrentMonth={atCurrentMonth}
            monthTitle={monthTitle}
            onShiftMonth={onShiftMonth}
            onToday={onToday}
          />
        </div>

        {roster.groups.length > 0 ? (
          /*
           * 分组切换沿用成员页那套胶囊 tab（`.chip-tabs` / `.chip-tab`，
           * 与设置页的分组 tab 是同一份样式）：同一个「按分组筛选」的动作
           * 在两页长得不一样，切页时会像换了个控件。
           * `.matrix-groups` 只留这一页特有的约束（别被矩阵挤扁）。
           */
          <div className="matrix-groups chip-tabs" role="group" aria-label="按分组筛选">
            <button
              aria-pressed={groupFilter === null}
              className={`chip-tab${groupFilter === null ? ' is-on' : ''}`}
              type="button"
              onClick={() => onGroupFilterChange(null)}
            >
              <span>全部</span>
              <span className="chip-tab-count">{roster.members.length}</span>
            </button>
            {roster.groups.map(group => {
              const count = roster.members.filter(member => member.groupId === group.id).length
              return (
                <button
                  aria-pressed={groupFilter === group.id}
                  className={`chip-tab${groupFilter === group.id ? ' is-on' : ''}`}
                  key={group.id}
                  type="button"
                  onClick={() => onGroupFilterChange(group.id)}
                >
                  <span>{group.name}</span>
                  <span className="chip-tab-count">{count}</span>
                </button>
              )
            })}
            {ungroupedCount > 0 ? (
              <button
                aria-pressed={groupFilter === UNGROUPED}
                className={`chip-tab${groupFilter === UNGROUPED ? ' is-on' : ''}`}
                type="button"
                onClick={() => onGroupFilterChange(UNGROUPED)}
              >
                <span>未分组</span>
                <span className="chip-tab-count">{ungroupedCount}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="canvas-tools">
          <div className="segmented" role="group" aria-label="矩阵视图">
            <button
              aria-pressed={mode === 'shift'}
              className={`segmented-item${mode === 'shift' ? ' is-on' : ''}`}
              type="button"
              onClick={() => onModeChange('shift')}
            >
              按班次
            </button>
            <button
              aria-pressed={mode === 'name'}
              className={`segmented-item${mode === 'name' ? ' is-on' : ''}`}
              type="button"
              onClick={() => onModeChange('name')}
            >
              按姓名
            </button>
          </div>
        </div>
      </div>

      {/* 页头固定：标题与视图切换留在原位，概览条与矩阵收进单独滚动的 flow */}
      <div className="canvas-flow">
        <SummaryBar date={workday} period={period} roster={viewRoster} />

        {groupEmpty ? (
          <div className="empty">
            <p className="empty-title">「{groupLabel}」还没有成员</p>
            <p className="empty-text">到「设置 → 人员配置」把成员归到这个分组，这里就会出现他们的排班。</p>
          </div>
        ) : (
          <TeamMatrix
            mode={mode}
            period={period}
            resetKey={groupFilter ?? 'all'}
            roster={viewRoster}
            today={workday}
            onEdit={onEdit}
          />
        )}
      </div>
    </div>
  )
}
