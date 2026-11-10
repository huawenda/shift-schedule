import type { ChangeBadge } from '../core/diff'

/** 对比表右侧的变化标签；颜色只做「有变化」提示，增删仍靠文字与符号 */
export function ChangeBadges({ badges }: { badges: readonly ChangeBadge[] }) {
  return (
    <span className="lookup-badges">
      {badges.map(badge => (
        <span className={`lookup-badge lookup-badge-${badge.tone}`} key={badge.key}>
          {badge.text}
        </span>
      ))}
    </span>
  )
}
