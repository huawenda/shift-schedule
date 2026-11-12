/**
 * 结果卡里的一个字段：`label` 在上、值在下。
 *
 * 型号条件卡与 FSPM 属性卡用的是同一种排版，抽出来避免两处各写一套 `<dl>`。
 */
export function LookupFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="lookup-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
