import { formatBezel } from '../core/display'
import type { Fspm, LookupGroup } from '../core/types'

/** 对比表里的紧凑 FSPM 项：P 号 + 厂家，材质/Bezel 不在这里展开 */
export function FspmInline({
  ids,
  fspm,
}: {
  ids: readonly string[]
  fspm: ReadonlyMap<string, Fspm>
}) {
  if (ids.length === 0) return <span className="lookup-muted">—</span>
  return (
    <span className="lookup-fspm-inline">
      {ids.map(id => {
        const item = fspm.get(id)
        return (
          <span className="lookup-inline-item" key={id}>
            <b>{id}</b>
            {item ? <span>{item.maker}</span> : null}
          </span>
        )
      })}
    </span>
  )
}

/**
 * 组合卡里的 FSPM 明细：3 列迷你表。
 *
 * 材质是现场最少用的属性，所以不占列，只跟在 P 号后面做弱化小字；
 * 厂家与 Bezel 是默认可见列。
 */
export function FspmTable({
  ids,
  fspm,
  showHead = true,
  expectedSize,
}: {
  ids: readonly string[]
  fspm: ReadonlyMap<string, Fspm>
  showHead?: boolean
  expectedSize?: string
}) {
  if (ids.length === 0) return <p className="lookup-muted">—</p>

  const rows = ids.map(id => ({ id, item: fspm.get(id) }))

  return (
    <table className="lookup-fspm-table">
      {showHead ? (
        <thead>
          <tr>
            <th scope="col">型号</th>
            <th scope="col">厂家</th>
            <th scope="col">Bezel</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map(row => {
          const invalid =
            !row.item || (expectedSize !== undefined && row.item.size !== expectedSize)
          return (
            <tr className={invalid ? 'is-invalid' : undefined} key={row.id}>
              <td>
                <span className="lookup-fspm-id">{row.id}</span>
                {row.item ? (
                  <span className="lookup-fspm-material">{row.item.material}</span>
                ) : null}
              </td>
              <td>{row.item?.maker ?? '—'}</td>
              <td>{row.item ? formatBezel(row.item.bezel) : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** 组合卡 / 型号结果里的主副 FSPM 面板 */
export function FspmPanel({
  group,
  part,
  fspm,
}: {
  group: LookupGroup
  part: 'main' | 'sub'
  fspm: ReadonlyMap<string, Fspm>
}) {
  const isMain = part === 'main'
  const size = isMain ? group.mainSize : group.subSize
  const bezel = isMain ? group.mainBezel : group.subBezel
  const ids = isMain ? group.mainFspm : group.subFspm

  return (
    <section className="lookup-fspm-panel">
      <header className="lookup-fspm-panel-head">
        <div>
          <span className="lookup-fspm-panel-title">
            {isMain ? 'Main' : 'Sub'} {size}
          </span>
          <span className="lookup-part-bezel">{formatBezel(bezel)}</span>
        </div>
        <span className="lookup-fspm-panel-count">可互换 {ids.length} 项</span>
      </header>
      <FspmTable expectedSize={size} fspm={fspm} ids={ids} />
    </section>
  )
}
