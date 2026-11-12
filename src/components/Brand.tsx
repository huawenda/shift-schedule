/**
 * 品牌标识与字标：侧栏头部和自绘标题栏共用同一份内容。
 *
 * 图案取自 design/logo/logo.svg，文案是「昼夜 / 个人倒班记录本」——
 * 三种尺寸只允许调排版，不改图案和文案本身。
 */

interface BrandMarkProps {
  className?: string
}

/** 一个圆，上半昼、下半夜，中间一颗星；星是「夜」的识别锚点，缩到再小也留着。 */
export function BrandMark({ className = 'size-9' }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 rounded-[10px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ${className}`}
      focusable="false"
      viewBox="0 0 192 192"
    >
      <rect fill="var(--brand-ink)" height="192" rx="44" width="192" />
      <circle cx="96" cy="96" fill="var(--brand-night)" r="58" />
      <path d="M38 96a58 58 0 0 1 116 0Z" fill="var(--brand-day)" />
      <path
        d="M96 106Q96 124 114 124Q96 124 96 142Q96 124 78 124Q96 124 96 106Z"
        fill="var(--brand-star)"
      />
    </svg>
  )
}

export type BrandVariant = 'bar' | 'sidebar' | 'hero'

interface BrandLockupProps {
  /** bar = 标题栏小字标；sidebar = Web 侧栏常规；hero = 壳里放大的大字标 */
  variant?: BrandVariant
  /** 侧栏折叠成 48px 图标条时隐藏文字，只留标识 */
  collapseText?: boolean
  className?: string
}

export function BrandLockup({
  variant = 'sidebar',
  collapseText = false,
  className = ''
}: BrandLockupProps) {
  const logoClass =
    variant === 'hero'
      ? 'size-11 group-data-[collapsible=icon]:size-6'
      : variant === 'bar'
        ? 'size-6'
        : 'size-9 group-data-[collapsible=icon]:size-6'

  return (
    <div className={`brand-lockup brand-lockup--${variant} flex min-w-0 items-center gap-2 ${className}`}>
      <BrandMark className={logoClass} />
      <div
        className={`grid min-w-0 text-left leading-tight ${collapseText ? 'group-data-[collapsible=icon]:hidden' : ''}`}
      >
        <span className="brand-lockup__name truncate text-sm font-semibold text-sidebar-foreground">
          昼夜
        </span>
        <span className="brand-lockup__slogan truncate text-xs text-muted-foreground">
          个人倒班记录本
        </span>
      </div>
    </div>
  )
}
