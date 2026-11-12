/**
 * 本分支只做宽屏，不做窄屏 / 手机响应式：**恒为 false**。
 *
 * 之所以保留这个导出，是因为 `components/ui/sidebar.tsx`（shadcn CLI 复制源码，
 * 按约定不改）会读它 —— 一旦返回 true，常驻侧栏就会被换成 `Sheet` 抽屉，
 * 还要先拉抽屉才能切页面，正是本分支禁止出现的行为。
 *
 * 于是：
 * - 侧栏永远走 CLI 的桌面分支（固定 240px，点击 / `Ctrl+B` 可折成图标条）；
 * - `SummaryBar` 统一用 shadcn `Popover`，不再有「手机自绘浮层」那套第二实现。
 *
 * 这里不用 useState / useEffect：没有需要监听的断点，也就不该引入首帧抖动。
 */
export function useIsMobile() {
  return false
}
