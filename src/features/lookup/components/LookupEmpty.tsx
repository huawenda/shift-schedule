import { Button } from '@/components/ui/button'

import type { LookupIndex } from '../core/indexes'
import type { EntityRef } from '../core/types'
import { LookupFootnote } from './LookupFootnote'

const EXAMPLES: EntityRef[] = [
  { type: 'model', key: 'FY' },
  { type: 'jig', key: '7748G' },
  { type: 'recipe', key: '31(10)' },
  { type: 'inch', key: '77/48' },
  { type: 'fspm', key: 'P467' },
]

/** 未选择时的引导：说明能查什么，并给几个覆盖不同实体类型的例子 */
export function LookupEmpty({
  index,
  onPick,
  notFound,
}: {
  index: LookupIndex
  onPick: (ref: EntityRef) => void
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

      <h2 className="lookup-empty-title">一个框搜全部：型号、JIG、Recipe、FSPM、英寸</h2>
      <p className="lookup-empty-desc">
        输入任意一项，结果会列出和它有关的所有组合；英寸也可以直接写 7748。
      </p>

      <div className="lookup-examples">
        <span className="lookup-examples-label">试试</span>
        {EXAMPLES.map(item => (
          <Button
            key={`${item.type}:${item.key}`}
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
