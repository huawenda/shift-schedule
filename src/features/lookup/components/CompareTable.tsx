import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { changeBadges, describeChange } from '../core/diff'
import { formatBezel } from '../core/display'
import type { Fspm, LookupGroup } from '../core/types'
import { ChangeBadges } from './ChangeBadges'
import { FspmInline, FspmPanel } from './FspmTable'

/** 同 INCH 对比表：一行一个组合，当前组合高亮，其它行可展开看完整 FSPM */
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

  /** 当前组合永远排第一行，其余保持原顺序 */
  const orderedGroups = groups.some(group => group.id === current.id)
    ? [current, ...groups.filter(group => group.id !== current.id)]
    : groups

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Table className="lookup-compare-table">
      <TableHeader>
        <TableRow>
          <TableHead>型号组</TableHead>
          <TableHead>P/N · Recipe</TableHead>
          <TableHead>Bezel</TableHead>
          <TableHead>Main</TableHead>
          <TableHead>Sub</TableHead>
          <TableHead>变化</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orderedGroups.map(group => {
          const isCurrent = group.id === current.id
          const isOpen = expanded.has(group.id)
          const lines = describeChange(current, group)

          return (
            <Fragment key={group.id}>
              <TableRow
                className={`lookup-compare-row${isCurrent ? ' is-current' : ''}`}
                onClick={() => {
                  if (!isCurrent) toggle(group.id)
                }}
              >
                <TableCell className="lookup-compare-models">
                  <span>{group.models.join(' / ')}</span>
                  {isCurrent ? <span className="lookup-current-tag">当前</span> : null}
                </TableCell>
                <TableCell className="lookup-compare-cond">
                  {group.jigPn} · {group.recipe}
                </TableCell>
                <TableCell className="lookup-compare-bezel">
                  {formatBezel(group.mainBezel)} / {formatBezel(group.subBezel)}
                </TableCell>
                <TableCell className="lookup-compare-fspm">
                  <FspmInline fspm={fspm} ids={group.mainFspm} />
                </TableCell>
                <TableCell className="lookup-compare-fspm">
                  <FspmInline fspm={fspm} ids={group.subFspm} />
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>

              {isOpen ? (
                <TableRow className="lookup-expand-row">
                  <TableCell colSpan={6}>
                    <div className="lookup-expand">
                      <ul className="lookup-expand-lines">
                        {lines.map(line => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <div className="lookup-fspm-grid">
                        <FspmPanel fspm={fspm} group={group} part="main" />
                        <FspmPanel fspm={fspm} group={group} part="sub" />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
