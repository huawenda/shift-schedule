/**
 * 品牌标识与字标：侧栏头部共用一份内容。
 *
 * 图案取自 design/logo/flat-abstract/mark-transparent-1024.png
 * （从 icon-1024.png 抠掉深底后的同一套扁平内六角）——
 * 只在展开 / 折叠两档调尺寸，不另画一套图形。
 * 字标是单行拉丁字标「Workhorse」，不再配中文 slogan。
 */

interface BrandMarkProps {
  className?: string
}

/**
 * 侧栏专用的**去底图形**：只有米白 L 形条、深握把与青点，没有圆角深底，
 * 直接透出侧栏自己的底色（见 titlebar.scss 的浅色主题适配）。
 *
 * 浏览器标签 / PWA / exe / 托盘仍用带深底的 `icon-192.png` —— 那些地方
 * 没有侧栏底色兜着，米白图形摊在浅色任务栏上会糊成一片。
 */
export function BrandMark({ className = 'size-14' }: BrandMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
      src="./icons/brand-mark-192.png"
    />
  )
}

interface BrandLockupProps {
  /** 侧栏折叠成 48px 图标条时隐藏文字，只留标识 */
  collapseText?: boolean
  className?: string
}

/**
 * 横向单行：56px 图标 + 26px 字标，垂直居中 —— 品牌区是侧栏的「头部」，
 * 字标要比 13px 的导航文字重得多，不能做成一条普通菜单项。
 * 早期有 bar / sidebar / hero 三档字号，是为早期「中文品牌 + 副标题」两行排版服务的；
 * 换成单行拉丁字标后三者没有差别，统一一份，折叠态只缩图标。
 */
export function BrandLockup({ collapseText = false, className = '' }: BrandLockupProps) {
  return (
    <div className={`brand-lockup flex min-w-0 items-center ${className}`}>
      <BrandMark className="size-14 group-data-[collapsible=icon]:size-6" />
      <span
        className={`brand-lockup__name truncate text-sidebar-foreground ${
          collapseText ? 'group-data-[collapsible=icon]:hidden' : ''
        }`}
      >
        Workhorse
      </span>
    </div>
  )
}
