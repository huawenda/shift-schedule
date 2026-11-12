import { ENTITY_LABEL, formatBezel } from '../core/display'
import type { LookupIndex } from '../core/indexes'
import { normalizeKey } from '../core/normalize'
import { relationsOf, type Relations } from '../core/relations'
import type { LookupView } from '../core/types'
import { GroupCard } from './GroupCard'
import { JigResult } from './JigResult'
import { LookupEmpty } from './LookupEmpty'
import { LookupFact } from './LookupFact'
import { LookupFootnote } from './LookupFootnote'
import { ModelResult } from './ModelResult'

interface EntityResultProps {
  view: Extract<LookupView, { kind: 'entity' }>
  index: LookupIndex
  onNavigate: (view: LookupView) => void
}

/**
 * 实体结果：先按类型决定用哪块，再统一兜底。
 *
 * P1 的范围是「先保 model / jig 兼容」：
 * - `model` 原样复用 `ModelResult`（条件卡 + 主副 FSPM + 同 INCH 对比）；
 * - `jig` / `recipe` 原样复用 `JigResult`；
 * - `group` 用单张 `GroupCard`；
 * - `inch` / `fspm` 走新的关联视图（头部 + 可点 chips + 关联组合）。
 *
 * P3 再把前三种也收进共用外壳，这里先不为了统一而重写已经验收过的结果页。
 */
export function EntityResult({ view, index, onNavigate }: EntityResultProps) {
  const relations = relationsOf(index, { type: view.type, key: view.key })

  if (relations.groups.length === 0) {
    return (
      <LookupEmpty
        index={index}
        notFound={view.key}
        onPick={ref => onNavigate({ kind: 'entity', type: ref.type, key: ref.key })}
      />
    )
  }

  if (view.type === 'model') {
    const [group] = relations.groups
    if (group) {
      const model =
        group.models.find(item => normalizeKey(item) === normalizeKey(view.key)) ?? view.key
      return <ModelResult group={group} index={index} model={model} />
    }
  }

  if (view.type === 'jig' || view.type === 'recipe') {
    const [entry] = relations.jigs
    if (entry) return <JigResult entry={entry} index={index} />
  }

  if (view.type === 'group') {
    const [group] = relations.groups
    if (group) {
      return (
        <div className="lookup-result">
          <GroupCard fspm={index.fspm} group={group} />
          <LookupFootnote index={index} />
        </div>
      )
    }
  }

  return (
    <RelatedResult
      index={index}
      onNavigate={onNavigate}
      relations={relations}
      view={view}
    />
  )
}

/**
 * inch / fspm 的关联视图。
 *
 * 两块信息按「先回答是什么，再回答和谁有关」排：
 * 1. 头部：实体类型、键、一句统计；FSPM 额外给四个属性和「被引用位置」表；
 * 2. 关联组合：直接铺 `GroupCard`，不套第二层卡片（DESIGN 禁止嵌套卡片）；
 * 3. chips：JIG / Recipe / INCH 可点，点了等于重新发起一次 command。
 */
function RelatedResult({
  index,
  view,
  relations,
  onNavigate,
}: {
  index: LookupIndex
  view: Extract<LookupView, { kind: 'entity' }>
  relations: Relations
  onNavigate: (view: LookupView) => void
}) {
  const isFspm = view.type === 'fspm'
  const refs = isFspm ? index.byFspm.get(normalizeKey(view.key)) ?? [] : []
  const [firstRef] = refs
  const fspm = isFspm
    ? (firstRef ? index.fspm.get(firstRef.id) : undefined) ?? index.fspm.get(view.key)
    : undefined
  const groupCount = new Set(refs.map(ref => ref.groupId)).size

  const summary = isFspm
    ? `被 ${groupCount} 个组合引用 · ${relations.models.length} 个型号`
    : `${relations.groups.length} 组合 · ${relations.models.length} 型号 · ${relations.jigs.length} 个 JIG`

  return (
    <div className="lookup-result">
      <section className="card-surface lookup-summary">
        <div className="lookup-summary-head">
          <div>
            <span className="lookup-entity-type">{ENTITY_LABEL[view.type]}</span>
            <h2 className="lookup-summary-title">{view.key}</h2>
            <p className="lookup-summary-sub">{summary}</p>
          </div>
          <span className="lookup-summary-inch">
            {fspm ? `${fspm.size}"` : `${relations.jigs.length} JIG`}
          </span>
        </div>

        {fspm ? (
          <dl className="lookup-facts">
            <LookupFact label="尺寸" value={`${fspm.size}"`} />
            <LookupFact label="厂家" value={fspm.maker} />
            <LookupFact label="材质" value={fspm.material} />
            <LookupFact label="Bezel" value={formatBezel(fspm.bezel)} />
          </dl>
        ) : null}

        <div className="lookup-chip-rows">
          {isFspm ? (
            <ChipRow
              items={relations.models}
              label="型号"
              onPick={model => onNavigate({ kind: 'entity', type: 'model', key: model })}
            />
          ) : null}
          <ChipRow
            items={relations.jigs.map(entry => entry.jigPn)}
            label="JIG"
            onPick={jig => onNavigate({ kind: 'entity', type: 'jig', key: jig })}
          />
          <ChipRow
            items={relations.recipes}
            label="Recipe"
            onPick={recipe => onNavigate({ kind: 'entity', type: 'recipe', key: recipe })}
          />
          <ChipRow
            items={relations.inches}
            label="INCH"
            onPick={inch => onNavigate({ kind: 'entity', type: 'inch', key: inch })}
          />
        </div>
      </section>

      {isFspm && refs.length > 0 ? (
        <section className="lookup-related">
          <header className="lookup-section-head">
            <h2>被引用位置</h2>
            <span>{groupCount} 个组合</span>
          </header>
          <table className="lookup-ref-table">
            <thead>
              <tr>
                <th scope="col">组合</th>
                <th scope="col">位置</th>
                <th scope="col">条件</th>
              </tr>
            </thead>
            <tbody>
              {refs.map(ref => {
                const group = index.byGroup.get(normalizeKey(ref.groupId))
                return (
                  <tr key={`${ref.groupId}:${ref.part}`}>
                    <td>
                      <button
                        className="lookup-ref-link"
                        onClick={() =>
                          onNavigate({ kind: 'entity', type: 'group', key: ref.groupId })
                        }
                        type="button"
                      >
                        {ref.groupId}
                      </button>
                    </td>
                    <td>{ref.part === 'main' ? 'Main' : 'Sub'}</td>
                    <td>
                      {group ? `${group.inch} · ${group.jigPn} · Recipe ${group.recipe}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="lookup-related">
        <header className="lookup-section-head">
          <h2>关联组合</h2>
          <span>{relations.groups.length} 组</span>
        </header>
        <div className="lookup-group-list">
          {relations.groups.map(group => (
            <GroupCard fspm={index.fspm} group={group} key={group.id} />
          ))}
        </div>
      </section>

      <LookupFootnote index={index} />
    </div>
  )
}

/** 一行可点 chips；条目太多时只铺前 24 个，余下用 `+N` 收尾 */
function ChipRow({
  label,
  items,
  max = 24,
  onPick,
}: {
  label: string
  items: readonly string[]
  max?: number
  onPick: (item: string) => void
}) {
  if (items.length === 0) return null
  const visible = items.slice(0, max)

  return (
    <div className="lookup-chip-row">
      <span className="lookup-chip-label">{label}</span>
      {visible.map(item => (
        <button
          className="lookup-chip lookup-chip-link"
          key={item}
          onClick={() => onPick(item)}
          type="button"
        >
          {item}
        </button>
      ))}
      {items.length > max ? (
        <span className="lookup-chip-more">+{items.length - max}</span>
      ) : null}
    </div>
  )
}
