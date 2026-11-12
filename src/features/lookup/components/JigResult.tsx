import type { JigEntry, LookupIndex } from '../core/indexes'
import { GroupCard } from './GroupCard'
import { LookupChip } from './LookupChip'

/** 已知 JIG P/N 或 Recipe：反查型号与每个组合的 FSPM */
export function JigResult({ entry, index }: { entry: JigEntry; index: LookupIndex }) {
  return (
    <div className="lookup-result">
      <section className="card-surface lookup-summary">
        <div className="lookup-summary-head">
          <div>
            <h2 className="lookup-summary-title">{entry.jigPn}</h2>
            <p className="lookup-summary-sub">
              Recipe {entry.recipe} · {entry.inches.join(' / ')} · {entry.groups.length} 个组合 /{' '}
              {entry.models.length} 个型号
            </p>
          </div>
          <span className="lookup-summary-inch">{entry.recipe}</span>
        </div>

        <div aria-label="该生产条件下的全部型号" className="lookup-model-row">
          {entry.models.map(model => (
            <LookupChip key={model}>{model}</LookupChip>
          ))}
        </div>
      </section>

      <div className="lookup-group-list">
        {entry.groups.map(group => (
          <GroupCard fspm={index.fspm} group={group} key={group.id} />
        ))}
      </div>

    </div>
  )
}
