import { ENTITY_LABEL, formatBezel } from '../core/display'
import type { LookupIndex } from '../core/indexes'
import { normalizeKey } from '../core/normalize'
import type { LookupGroup, LookupView } from '../core/types'
import { GroupCard } from './GroupCard'
import { LookupFact } from './LookupFact'

interface FspmResultProps {
  view: Extract<LookupView, { kind: 'entity' }>
  index: LookupIndex
  onNavigate: (view: LookupView) => void
}

/**
 * FSPM 结果：属性 + 被引用位置 + 关联组合。
 *
 * 回答的是 v1 完全没覆盖的方向 —— 手上只有一个 P 号时，
 * 反查它被哪些组合的 Main / Sub 用了。
 */
export function FspmResult({ view, index, onNavigate }: FspmResultProps) {
  const refs = index.byFspm.get(normalizeKey(view.key)) ?? []
  const [firstRef] = refs
  const fspm = (firstRef ? index.fspm.get(firstRef.id) : undefined) ?? index.fspm.get(view.key)

  const groupIds = [...new Set(refs.map(ref => ref.groupId))]
  const groups = groupIds
    .map(id => index.byGroup.get(normalizeKey(id)))
    .filter((group): group is LookupGroup => Boolean(group))

  const models = new Set<string>()
  for (const group of groups) for (const model of group.models) models.add(model)

  return (
    <div className="lookup-result">
      <section className="card-surface lookup-summary">
        <div className="lookup-summary-head">
          <div>
            <span className="lookup-entity-type">{ENTITY_LABEL.fspm}</span>
            <h2 className="lookup-summary-title">{view.key}</h2>
            <p className="lookup-summary-sub">
              被 {groupIds.length} 个组合引用 · {models.size} 个型号
            </p>
          </div>
          <span className="lookup-summary-inch">{fspm ? `${fspm.size}"` : 'FSPM'}</span>
        </div>

        {fspm ? (
          <dl className="lookup-facts">
            <LookupFact label="尺寸" value={`${fspm.size}"`} />
            <LookupFact label="厂家" value={fspm.maker} />
            <LookupFact label="材质" value={fspm.material} />
            <LookupFact label="Bezel" value={formatBezel(fspm.bezel)} />
          </dl>
        ) : null}
      </section>

      {refs.length > 0 ? (
        <section className="lookup-related">
          <header className="lookup-section-head">
            <h2>被引用位置</h2>
            <span>{groupIds.length} 个组合</span>
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
          <span>{groups.length} 组</span>
        </header>
        <div className="lookup-group-list">
          {groups.map(group => (
            <GroupCard fspm={index.fspm} group={group} key={group.id} />
          ))}
        </div>
      </section>
    </div>
  )
}
