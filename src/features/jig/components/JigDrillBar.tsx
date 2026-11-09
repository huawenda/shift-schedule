import { Button } from '@/components/ui/button'

import type { DrillState } from '../core/drill'

interface JigDrillBarProps {
  /** 当前下钻状态 */
  drill: DrillState
  /** 返回上一层（退出下钻） */
  onBack: () => void
  /** 明细行数 */
  rowCount: number
  /** 尺寸不匹配的行数 */
  mismatchCount: number
}

/**
 * 下钻面包屑条。
 *
 * 下钻时**占掉工具条的位置** —— 原项目就是这么做的：用户看到的始终是
 * 「当前在哪一层、能干什么」，而不是同时摆着透视表的工具条和明细的。
 *
 * 面包屑从「全量透视 / 结果透视」一路到具体的 P/N · CST · 工序，
 * 与原项目一致。
 */
export function JigDrillBar({ drill, onBack, rowCount, mismatchCount }: JigDrillBarProps) {
  return (
    <div className="jig-toolbar jig-drill-bar">
      <Button onClick={onBack} size="sm" type="button" variant="outline">
        ← 返回
      </Button>

      <nav aria-label="下钻路径" className="jig-drill-crumbs">
        {drill.crumbs.map((crumb, index) => (
          <span className="jig-drill-part" key={`${crumb}-${index}`}>
            {index > 0 ? (
              <span aria-hidden="true" className="jig-drill-sep">
                ›
              </span>
            ) : null}
            <span
              className={
                index === drill.crumbs.length - 1
                  ? 'jig-drill-crumb is-last'
                  : 'jig-drill-crumb'
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <span className="jig-toolbar-spacer" />

      {mismatchCount > 0 ? (
        <span className="jig-toolbar-label">尺寸不匹配 {mismatchCount} 行</span>
      ) : null}
      <span className="jig-toolbar-label">{rowCount} 条</span>
    </div>
  )
}
