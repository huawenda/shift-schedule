/**
 * 品牌标识与字标：侧栏头部和自绘标题栏共用同一份内容。
 *
 * 图案取自 design/logo/hexkey/icon-1024.png（石墨底四把内六角组套）——
 * 三种尺寸只允许调排版，不改图案和文案本身。
 */

interface BrandMarkProps {
  className?: string
}

/** 直接用应用图标，侧栏、标题栏和任务栏保持同一张图。 */
export function BrandMark({ className = 'size-9' }: BrandMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
      src="./icons/icon-192.png"
    />
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
