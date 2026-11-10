/** GLS 型号 chip：型号本身没有更多属性，只做识别 */
export function LookupChip({ children }: { children: string }) {
  return <span className="lookup-chip">{children}</span>
}
