import { DIMENSION_LABEL, QUICK_ENTRIES } from '../core/display'
import type { LookupIndex } from '../core/indexes'
import type { LookupDimension, LookupView } from '../core/types'
import { LookupFootnote } from './LookupFootnote'

const DIMENSIONS: readonly LookupDimension[] = ['inch', 'model', 'fspm', 'jig']

const DIM_DESC: Record<LookupDimension, string> = {
  inch: '看每种英寸组合下的全部组合',
  model: '查主副 FSPM 与同 INCH 对比',
  fspm: '反查被哪些组合的 Main / Sub 引用',
  jig: '按夹具或 Recipe 反查型号',
}

/**
 * 速查页的默认落地：数据概览 + 四个浏览维度 + 快速入口。
 *
 * 取代 v1 的空态引导 —— 没有明确编号的人也能先逛起来；
 * 有编号的人仍然用页头的 command 直接搜，两条路不冲突。
 */
export function LookupHome({
  index,
  onNavigate,
  onBrowse,
}: {
  index: LookupIndex
  onNavigate: (view: LookupView) => void
  onBrowse: (dim: LookupDimension) => void
}) {
  const counts: Record<LookupDimension, number> = {
    inch: index.byInch.size,
    model: index.byModel.size,
    fspm: index.fspm.size,
    jig: index.jigs.length,
  }

  return (
    <div className="lookup-home">
      <section className="card-surface lookup-summary">
        <div className="lookup-summary-head">
          <div>
            <h2 className="lookup-summary-title">先浏览，或者直接搜</h2>
            <p className="lookup-summary-sub">
              {index.groups.length} 个组合 · {counts.model} 个型号 · {counts.fspm} 个 FSPM
            </p>
          </div>
          <span className="lookup-summary-inch">{counts.jig} JIG</span>
        </div>

        <div className="lookup-dim-grid">
          {DIMENSIONS.map(dim => (
            <button
              className="lookup-dim-card"
              key={dim}
              onClick={() => onBrowse(dim)}
              type="button"
            >
              <span className="lookup-dim-title">{DIMENSION_LABEL[dim]}</span>
              <span className="lookup-dim-count">{counts[dim]} 项</span>
              <span className="lookup-dim-desc">{DIM_DESC[dim]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lookup-related">
        <header className="lookup-section-head">
          <h2>快速入口</h2>
          <span>点一下直接看关联结果</span>
        </header>
        <div className="lookup-chip-row">
          {QUICK_ENTRIES.map(ref => (
            <button
              className="lookup-chip lookup-chip-link"
              key={`${ref.type}:${ref.key}`}
              onClick={() => onNavigate({ kind: 'entity', type: ref.type, key: ref.key })}
              type="button"
            >
              {ref.key}
            </button>
          ))}
        </div>
      </section>

      <LookupFootnote index={index} />
    </div>
  )
}
