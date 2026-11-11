import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { changeBadges, describeChange } from '../core/diff'
import { formatBezel } from '../core/display'
import { normalizeKey } from '../core/normalize'
import type { Fspm, LookupGroup } from '../core/types'
import { ChangeBadges } from './ChangeBadges'
import { FspmInline, FspmPanel } from './FspmTable'

/** 型号组 / P/N / Recipe / Main / Sub 任一命中即可 */
function groupMatches(group: LookupGroup, keyword: string): boolean {
  return [
    group.id,
    group.jigPn,
    group.recipe,
    ...group.models,
    ...group.mainFspm,
    ...group.subFspm,
  ].some(value => normalizeKey(value).includes(keyword))
}

/** 同 INCH 对比：一行一张卡片，当前组合高亮，其它卡片可展开看完整 FSPM */
export function CompareTable({
  current,
  groups,
  fspm,
}: {
  current: LookupGroup
  groups: readonly LookupGroup[]
  fspm: ReadonlyMap<string, Fspm>
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [filter, setFilter] = useState('')

  const keyword = normalizeKey(filter)

  /** 当前组合永远排第一行，其余保持原顺序 */
  const orderedGroups = useMemo(
    () =>
      groups.some(group => group.id === current.id)
        ? [current, ...groups.filter(group => group.id !== current.id)]
        : groups,
    [current, groups],
  )

  const visibleGroups = keyword
    ? orderedGroups.filter(group => groupMatches(group, keyword))
    : orderedGroups

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="lookup-compare-body">
      <div className="lookup-compare-filter">
        <div className="lookup-filter-input">
          <Search aria-hidden="true" className="lookup-input-icon" />
          <Input
            aria-label="筛选同 INCH 组合"
            className="lookup-input h-8 bg-background pr-8 pl-8"
            onChange={event => setFilter(event.target.value)}
            placeholder="筛选 型号 / P/N / Recipe / FSPM"
            spellCheck={false}
            value={filter}
          />
          {filter ? (
            <Button
              aria-label="清空筛选"
              className="lookup-clear"
              onClick={() => setFilter('')}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          ) : null}
        </div>
        {keyword ? (
          <span className="lookup-compare-count">
            筛出 {visibleGroups.length} / {orderedGroups.length} 组
          </span>
        ) : null}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="lookup-muted lookup-compare-empty">没有匹配的组合</p>
      ) : (
        <>
          <div className="lookup-compare-head" aria-hidden="true">
            <span>型号组</span>
            <span>P/N · Recipe</span>
            <span>Bezel</span>
            <span>Main</span>
            <span>Sub</span>
            <span>变化</span>
          </div>

          <div className="lookup-compare-list" role="list">
            {visibleGroups.map(group => {
              const isCurrent = group.id === current.id
              const isOpen = expanded.has(group.id)
              const lines = describeChange(current, group)

              return (
                <div
                  className={`lookup-compare-card${isCurrent ? ' is-current' : ''}${isOpen ? ' is-open' : ''}`}
                  key={group.id}
                  role="listitem"
                >
                  <div
                    className="lookup-compare-row"
                    onClick={() => {
                      if (!isCurrent) toggle(group.id)
                    }}
                  >
                    <div className="lookup-compare-cell lookup-compare-models">
                      <span>{group.models.join(' / ')}</span>
                    </div>
                    <div className="lookup-compare-cell lookup-compare-cond">
                      {group.jigPn} · {group.recipe}
                    </div>
                    <div className="lookup-compare-cell lookup-compare-bezel">
                      {formatBezel(group.mainBezel)} / {formatBezel(group.subBezel)}
                    </div>
                    <div className="lookup-compare-cell lookup-compare-fspm">
                      <FspmInline fspm={fspm} ids={group.mainFspm} />
                    </div>
                    <div className="lookup-compare-cell lookup-compare-fspm">
                      <FspmInline fspm={fspm} ids={group.subFspm} />
                    </div>
                    <div className="lookup-compare-cell">
                      <div className="lookup-change-cell">
                        <ChangeBadges badges={changeBadges(current, group)} />
                        {isCurrent ? null : (
                          <Button
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? '收起' : '展开'} ${group.id} 的 FSPM 明细`}
                            className="lookup-expand-btn"
                            onClick={event => {
                              event.stopPropagation()
                              toggle(group.id)
                            }}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <ChevronDown className={isOpen ? 'is-open' : undefined} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="lookup-expand">
                      <div className="lookup-fspm-grid">
                        <FspmPanel fspm={fspm} group={group} part="main" />
                        <FspmPanel fspm={fspm} group={group} part="sub" />
                      </div>
                      <p className="lookup-expand-note">
                        {lines[0]}；{lines.slice(1).join('，')}
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
