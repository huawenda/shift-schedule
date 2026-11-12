import type { Relations } from '../core/relations'
import type { LookupView } from '../core/types'

interface EntityChipsProps {
  relations: Relations
  onNavigate: (view: LookupView) => void
  /** 型号是否作为关联项露出；同组等同的型号点进去没有新信息，默认不显示 */
  includeModels?: boolean
}

/**
 * 关联项 chips：结果页的漫游入口。
 *
 * 每个 chip 都可点，点了等于重新发起一次 command —— 用户不必退回输入框。
 * 四类实体（model / jig / group / fspm）共用这一块，文案与跳转只写一份。
 */
export function EntityChips({ relations, onNavigate, includeModels = false }: EntityChipsProps) {
  const hasAny =
    (includeModels && relations.models.length > 0) ||
    relations.jigs.length > 0 ||
    relations.recipes.length > 0 ||
    relations.inches.length > 0
  if (!hasAny) return null

  return (
    <section className="lookup-related">
      <header className="lookup-section-head">
        <h2>关联项</h2>
        <span>点一下继续查</span>
      </header>
      <div className="lookup-chip-rows">
        {includeModels ? (
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
