import { Select } from '@/components/Select'

import { REVIEW_SCOPES, type ReviewScope } from '../core/review'

interface JigReviewToolbarProps {
  /** 当前 P/N 过滤（「全部」或某个型号） */
  pn: string
  /** 改 P/N 过滤 */
  onPnChange: (pn: string) => void
  /** P/N 候选项 */
  pnOptions: string[]
  /** 当前审查视野 */
  scope: ReviewScope
  /** 改审查视野 */
  onScopeChange: (scope: ReviewScope) => void
  /** 两档的行数 */
  counts: Record<ReviewScope, number>
}

/**
 * 数据审查页的工具条：P/N 过滤 + 两档视野。
 *
 * **P/N 下拉在左，两档分段在右。** 两档是「这一范围的哪些对象要看」，
 * P/N 是「看哪个型号的范围」—— 两者正交，分开摆比塞进一个控件清楚。
 *
 * 每档带行数：不用先勾上才知道有多少行对不上。
 */
export function JigReviewToolbar({
  pn,
  onPnChange,
  pnOptions,
  scope,
  onScopeChange,
  counts
}: JigReviewToolbarProps) {
  return (
    <div className="jig-toolbar">
      <Select
        ariaLabel="按型号过滤"
        className="jig-scope-select"
        groups={[
          {
            options: [
              { value: '全部', label: '全部' },
              ...pnOptions.map(option => ({ value: option, label: option }))
            ]
          }
        ]}
        onChange={onPnChange}
        value={pn}
      />

      <span className="jig-toolbar-spacer" />

      <div aria-label="审查范围" className="segmented" role="group">
        {REVIEW_SCOPES.map(item => (
          <button
            aria-pressed={scope === item.id}
            className={`segmented-item${scope === item.id ? ' is-on' : ''}`}
            key={item.id}
            type="button"
            onClick={() => onScopeChange(item.id)}
          >
            {item.label}
            <span className="jig-toolbar-count">{counts[item.id]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
