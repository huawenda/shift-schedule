import { ENTITY_LABEL } from '../core/display'
import type { LookupIndex } from '../core/indexes'
import { relationsOf } from '../core/relations'
import type { LookupView } from '../core/types'
import { GroupCard } from './GroupCard'

interface InchResultProps {
  view: Extract<LookupView, { kind: 'entity' }>
  index: LookupIndex
  onNavigate: (view: LookupView) => void
}

/**
 * INCH 结果：该英寸下的全部组合，按 JIG 分组给一条统计。
 *
 * 回答的是「7748 这个尺寸都做哪些东西」—— 不做同 INCH 的变化对比：
 * 那需要一个「当前组合」作基准，而 inch 维度本身没有基准。
 * 需要逐组对比时，从统计条点进某个 JIG，或在组合卡里看主副 FSPM。
 */
export function InchResult({ view, index, onNavigate }: InchResultProps) {
  const relations = relationsOf(index, { type: 'inch', key: view.key })

  const byJig = new Map<string, { jigPn: string; recipe: string; count: number }>()
  for (const group of relations.groups) {
    const entry = byJig.get(group.jigPn)
    if (entry) entry.count += 1
    else byJig.set(group.jigPn, { jigPn: group.jigPn, recipe: group.recipe, count: 1 })
  }
  const jigStats = [...byJig.values()].sort((a, b) => a.jigPn.localeCompare(b.jigPn))

  return (
    <div className="lookup-result">
      <section className="card-surface lookup-summary">
        <div className="lookup-summary-head">
          <div>
            <span className="lookup-entity-type">{ENTITY_LABEL.inch}</span>
            <h2 className="lookup-summary-title">{view.key}</h2>
            <p className="lookup-summary-sub">
              {relations.groups.length} 组合 · {relations.models.length} 型号 ·{' '}
              {relations.jigs.length} 个 JIG
            </p>
          </div>
          <span className="lookup-summary-inch">{relations.jigs.length} JIG</span>
        </div>

        <div className="lookup-stat-row">
          {jigStats.map(item => (
            <button
              className="lookup-stat"
              key={item.jigPn}
              onClick={() => onNavigate({ kind: 'entity', type: 'jig', key: item.jigPn })}
              type="button"
            >
              <span className="lookup-stat-label">{item.jigPn}</span>
              <span className="lookup-stat-value">
                {item.count} 组 · Recipe {item.recipe}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="lookup-related">
        <header className="lookup-section-head">
          <h2>该英寸下的组合</h2>
          <span>{relations.groups.length} 组</span>
        </header>
        <div className="lookup-group-list">
          {relations.groups.map(group => (
            <GroupCard fspm={index.fspm} group={group} key={group.id} />
          ))}
        </div>
      </section>
    </div>
  )
}
