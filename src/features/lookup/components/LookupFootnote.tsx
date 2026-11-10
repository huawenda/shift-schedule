import { LOOKUP_DATA_VERSION } from '../data/lookupData'
import type { LookupIndex } from '../core/indexes'

/** 页面底部的数据快照说明，三个结果区共用 */
export function LookupFootnote({ index }: { index: LookupIndex }) {
  return (
    <p className="lookup-footnote">
      数据快照 {LOOKUP_DATA_VERSION} · {index.groups.length} 组 / {index.byModel.size} 型号 /{' '}
      {index.fspm.size} 个 FSPM
    </p>
  )
}
