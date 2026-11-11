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

  /* 同一厂家独占一行：按厂家分组，组内保持原顺序 */
  const rows: { maker: string; ids: string[] }[] = []
  for (const id of ids) {
    const maker = fspm.get(id)?.maker ?? ''
    const row = rows.find(item => item.maker === maker)
    if (row) row.ids.push(id)
    else rows.push({ maker, ids: [id] })
  }

  return (
    <span className="lookup-fspm-inline">
      {rows.map(row => (
        <span className="lookup-inline-row" key={row.maker || row.ids[0]}>
          {row.ids.map(id => {
            const item = fspm.get(id)
            return (
              <span className="lookup-inline-item" key={id}>
                <b>{id}</b>
                {item ? <span>{item.maker}</span> : null}
              </span>
            )
          })}
        </span>
      ))}
    </span>
  )
}

/**
 * 组合卡里的 FSPM 明细：3 列迷你表（型号 / 厂家 / 材质）。
 *
 * Bezel 已由面板标题给出，行内再列一次属于重复信息。
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
            <th scope="col">材质</th>
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
              </td>
              <td>{row.item?.maker ?? '—'}</td>
              <td>{row.item?.material ?? '—'}</td>
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
