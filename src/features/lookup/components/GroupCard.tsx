import type { Fspm, LookupGroup } from '../core/types'
import { FspmPanel } from './FspmTable'
import { LookupChip } from './LookupChip'

/** 一个生产条件组合：组内型号等同，主/副各一组可互换 FSPM */
export function GroupCard({
  group,
  fspm,
}: {
  group: LookupGroup
  fspm: ReadonlyMap<string, Fspm>
}) {
  return (
    <article className="card-surface lookup-group-card">
      <header className="lookup-group-head">
        <div className="lookup-group-headline">
          <span className="lookup-group-id">{group.id}</span>
          <span className="lookup-group-inch">{group.inch}</span>
          <span className="lookup-group-cond">
            {group.jigPn} · Recipe {group.recipe}
          </span>
        </div>
        <span className="lookup-group-count">{group.models.length} 个型号等同</span>
      </header>

      <div aria-label="组内等同型号" className="lookup-model-row">
        {group.models.map(model => (
          <LookupChip key={model}>{model}</LookupChip>
        ))}
      </div>

      <div className="lookup-fspm-grid">
        <FspmPanel fspm={fspm} group={group} part="main" />
        <FspmPanel fspm={fspm} group={group} part="sub" />
      </div>
    </article>
  )
}
