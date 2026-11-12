import { Select } from '@/components/Select'

import type { StageCategory } from '../core/pivot'
import { PIVOT_AVAIL_OPTIONS, type PivotScope } from '../core/pivotScope'

interface JigPivotToolbarProps {
  /** 当前显示范围 */
  scope: PivotScope
  /** 改显示范围 */
  onScopeChange: (scope: PivotScope) => void
  /** P/N 候选项（取自透视小计行，顺序与表格一致） */
  pnOptions: string[]
  /** 当前可用性档位 */
  avail: StageCategory
  /** 改可用性档位 */
  onAvailChange: (avail: StageCategory) => void
  /** 三档计数（口径与透视表一致） */
  availCounts: Record<StageCategory, number>
}

/**
 * 全量透视页的工具条：显示范围 + 可用性筛选。
 *
 * **显示范围是一个下拉而不是两个控件**：P/N 与「全部/生产中」共用同一个下拉框。
 * 选某个 P/N 时就不再叠加「生产中」筛选 —— 两个条件互斥却挤在一个单选框里，
 * 用户会判断不出当前到底生效了哪个。
 *
 * **不配字段名**：这个下拉是工具条的第一个元素，贴着表格外框的左缘。
 * 位置已经说明了它在过滤下面这张表，再顶一个「显示范围」只会把控件推离表格、
 * 和表头错开一格。
 *
 * **可用性是三态分段**：它只有三档且互斥，用分段控件比下拉更快。
 * 每档后面带计数，计数口径与透视表总计行一致（先按显示范围取行，再分档）。
 */
export function JigPivotToolbar({
  scope,
  onScopeChange,
  pnOptions,
  avail,
  onAvailChange,
  availCounts
}: JigPivotToolbarProps) {
  return (
    <div className="jig-toolbar">
      <Select
        ariaLabel="显示范围"
        className="jig-scope-select"
        groups={[
          {
            options: [
              { value: 'all', label: '全部数据' },
              { value: 'prod', label: '生产中' }
            ]
          },
          ...(pnOptions.length > 0
            ? [
                {
                  label: '按型号',
                  options: pnOptions.map(pn => ({
                    value: `pn:${pn}`,
                    label: pn
                  }))
                }
              ]
            : [])
        ]}
        onChange={next => onScopeChange(next as PivotScope)}
        value={scope}
      />

      <span className="jig-toolbar-spacer" />

      <div aria-label="可用性" className="segmented" role="group">
        {PIVOT_AVAIL_OPTIONS.map(option => (
          <button
            aria-pressed={avail === option.id}
            className={`segmented-item${avail === option.id ? ' is-on' : ''}`}
            key={option.id}
            type="button"
            onClick={() => onAvailChange(option.id)}
          >
            {option.label}
            <span className="jig-toolbar-count">{availCounts[option.id]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
