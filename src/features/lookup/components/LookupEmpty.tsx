import { Button } from '@/components/ui/button'

import type { LookupIndex } from '../core/indexes'
import type { LookupSelection } from '../core/types'
import { LookupFootnote } from './LookupFootnote'

const EXAMPLES: LookupSelection[] = [
  { mode: 'model', key: 'FY' },
  { mode: 'jig', key: '7748G' },
  { mode: 'jig', key: '31(10)' },
]

/** 未选择时的引导：说明能查什么，并给三个可直接点的例子 */
export function LookupEmpty({
  index,
  onPick,
  notFound,
}: {
  index: LookupIndex
  onPick: (selection: LookupSelection) => void
  /** 深链里的 key 找不到时显示 */
  notFound?: string
}) {
  return (
    <section className="card-surface lookup-empty">
      {notFound ? (
        <p className="lookup-empty-notfound">
          没找到「{notFound}」。可以换一个型号 / JIG P/N / Recipe。
        </p>
      ) : null}

      <h2 className="lookup-empty-title">输入 GLS 型号，查它可用的 Main / Sub FSPM</h2>
      <p className="lookup-empty-desc">输入 JIG P/N 或 Recipe，反查能做哪些型号。</p>

      <div className="lookup-examples">
        <span className="lookup-examples-label">试试</span>
        {EXAMPLES.map(item => (
          <Button
            key={`${item.mode}:${item.key}`}
            onClick={() => onPick(item)}
            size="sm"
            type="button"
            variant="outline"
          >
            {item.key}
          </Button>
        ))}
      </div>

      <LookupFootnote index={index} />
    </section>
  )
}
