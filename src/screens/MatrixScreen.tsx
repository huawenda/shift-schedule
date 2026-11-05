import { useEffect, useMemo, useState } from 'react'
import { SummaryBar } from '../components/SummaryBar'
import { TeamMatrix, type MatrixMode } from '../components/TeamMatrix'
import { formatPeriodRange, type Period } from '../data/period'
import { groupNameOf, membersOfGroup, type Member, type Roster } from '../data/roster'

interface MatrixScreenProps {
  roster: Roster
  period: Period
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
 * 视图切换（按班次 / 按姓名）只存在组件 state 里，**不落存储**：
 * 离开这一页再回来就是默认的「按班次」，与 web 端一致。
 *
 * 分组筛选同理：默认「全部」，切组后概览条与矩阵一起收窄。
 * 分组筛选不是独立页面，也不改变行顺序 —— 只是把 roster.members 过滤成当前组。
 */
export function MatrixScreen({ roster, period, onEdit }: MatrixScreenProps) {
  const [mode, setMode] = useState<MatrixMode>('shift')
  /** null = 全部；UNGROUPED = 未分组；其余是分组 id */
  const [groupFilter, setGroupFilter] = useState<string | null>(null)

  const ungroupedCount = roster.members.filter(member => !member.groupId).length

  // 分组被删、或「未分组」已经没人时，自动退回「全部」，不让筛选停在空集合上
  useEffect(() => {
    if (!groupFilter) return
    if (groupFilter === UNGROUPED) {
      if (ungroupedCount === 0) setGroupFilter(null)
      return
    }
    if (!roster.groups.some(group => group.id === groupFilter)) setGroupFilter(null)
  }, [groupFilter, roster.groups, ungroupedCount])

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
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">全员矩阵</h1>
          <p className="canvas-sub">
            {formatPeriodRange(period)} · 共 {period.dates.length} 天 ·{' '}
            {groupLabel ? `${groupLabel} · ${visibleMembers.length} 位成员` : `${roster.members.length} 位成员`}
          </p>
        </div>

        <div className="canvas-tools">
          <div className="segmented" role="group" aria-label="矩阵视图">
            <button
              aria-pressed={mode === 'shift'}
              className={`segmented-item${mode === 'shift' ? ' is-on' : ''}`}
              type="button"
              onClick={() => setMode('shift')}
            >
              按班次
            </button>
            <button
              aria-pressed={mode === 'name'}
              className={`segmented-item${mode === 'name' ? ' is-on' : ''}`}
              type="button"
              onClick={() => setMode('name')}
            >
              按姓名
            </button>
          </div>
        </div>
      </div>

      {/* 页头固定：标题与视图切换留在原位，概览条与矩阵收进单独滚动的 flow */}
      <div className="canvas-flow">
        {roster.groups.length > 0 ? (
          <div className="matrix-groups" role="group" aria-label="按分组筛选">
            <button
              aria-pressed={groupFilter === null}
              className={`matrix-group-chip${groupFilter === null ? ' is-on' : ''}`}
              type="button"
              onClick={() => setGroupFilter(null)}
            >
              <span>全部</span>
              <span className="matrix-group-chip-count">{roster.members.length}</span>
            </button>
            {roster.groups.map(group => {
              const count = roster.members.filter(member => member.groupId === group.id).length
              return (
                <button
                  aria-pressed={groupFilter === group.id}
                  className={`matrix-group-chip${groupFilter === group.id ? ' is-on' : ''}`}
                  key={group.id}
                  type="button"
                  onClick={() => setGroupFilter(group.id)}
                >
                  <span>{group.name}</span>
                  <span className="matrix-group-chip-count">{count}</span>
                </button>
              )
            })}
            {ungroupedCount > 0 ? (
              <button
                aria-pressed={groupFilter === UNGROUPED}
                className={`matrix-group-chip${groupFilter === UNGROUPED ? ' is-on' : ''}`}
                type="button"
                onClick={() => setGroupFilter(UNGROUPED)}
              >
                <span>未分组</span>
                <span className="matrix-group-chip-count">{ungroupedCount}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        <SummaryBar period={period} roster={viewRoster} />

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
            onEdit={onEdit}
          />
        )}
      </div>
    </div>
  )
}
