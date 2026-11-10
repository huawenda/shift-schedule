import { formatBezel } from '../core/display'
import { sameInchGroups, type LookupIndex } from '../core/indexes'
import type { LookupGroup } from '../core/types'
import { CompareTable } from './CompareTable'
import { FspmPanel } from './FspmTable'
import { LookupFootnote } from './LookupFootnote'

/** 已知 GLS 型号：条件卡 + 主副 FSPM + 同 INCH 对比 */
export function ModelResult({
  model,
  group,
  index,
}: {
  model: string
  group: LookupGroup
  index: LookupIndex
}) {
  const groups = sameInchGroups(index, group.inch)

  return (
    <div className="lookup-result">
      <section className="card-surface lookup-summary">
        <div className="lookup-summary-head">
          <div>
            <h2 className="lookup-summary-title">{model}</h2>
            <p className="lookup-summary-sub">
              同组 {group.models.length} 个型号完全等同：{group.models.join(' / ')}
            </p>
          </div>
          <span className="lookup-summary-inch">{group.inch}</span>
        </div>

        <dl className="lookup-facts">
          <Fact label="INCH" value={group.inch} />
          <Fact label="JIG P/N" value={group.jigPn} />
          <Fact label="Recipe" value={group.recipe} />
          <Fact
            label="Main"
            value={`${group.mainSize} · ${formatBezel(group.mainBezel)}`}
          />
          <Fact
            label="Sub"
            value={`${group.subSize} · ${formatBezel(group.subBezel)}`}
          />
        </dl>
      </section>

      <div className="lookup-fspm-grid">
        <FspmPanel fspm={index.fspm} group={group} part="main" />
        <FspmPanel fspm={index.fspm} group={group} part="sub" />
      </div>

      <section className="card-surface lookup-compare">
        <header className="lookup-section-head">
          <h2>同 INCH 型号对比</h2>
          <span>
            {group.inch} · 共 {groups.length} 组
          </span>
        </header>
        <CompareTable current={group} fspm={index.fspm} groups={groups} />
      </section>

      <LookupFootnote index={index} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="lookup-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
