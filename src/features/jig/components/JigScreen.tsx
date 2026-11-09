import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { JigConfig } from '../core/config'
import type { ReviewScope } from '../core/review'
import { ALL_PN } from '../core/reviewView'
import { computeViewCounts } from '../core/view'
import type { JigData } from '../hooks/useJigData'
import { JigDrillBar } from './JigDrillBar'
import { JigPivotToolbar } from './JigPivotToolbar'
import { JigQueryPanel } from './JigQueryPanel'
import { JigReviewToolbar } from './JigReviewToolbar'
import { JigStageRail } from './JigStageRail'
import { JigTable } from './JigTable'
import {
  JIG_TAB_LABELS,
  JIG_TAB_ORDER,
  type JigTabId
} from './jigTabs'

interface JigScreenProps {
  /** 当前子页：由 App 从 hash 解析后持有 */
  tab: JigTabId
  onTabChange: (tab: JigTabId) => void
  /**
   * JIG 的数据状态。
   *
   * 由 App 持有而不是页面自己 —— 顶栏也要用源文件名与「浏览」按钮，
   * 而顶栏在外壳层、页面在内容层，两边共用同一份状态才不用各建一份。
   */
  data: JigData
  /** 业务配置 */
  config: JigConfig
  /** 提示条 */
  notify: (text: string, tone?: 'info' | 'warning' | 'error') => void
}

/**
 * JIG 数据页 —— MES JIG 数据的查询与透视。
 *
 * 与排班的三页不同，这里**没有结算月的概念**：JIG 数据来自 MES 导出的
 * Excel 文件，与哪个月份无关。所以这一页的 hash 不带月份前缀（`#/jig/pivot`），
 * 页头也不放月份导航。
 *
 * ## 布局（与原项目同构）
 *
 * ```
 * .canvas.is-jig            页头固定，下面的内容不滚
 *   .canvas-flow            吃掉剩余高度，不滚
 *     .jig-tabs             页签
 *       .jig-tab-panel      吃掉剩余高度
 *         .jig-layout       两列：左输入栏 + 右主区
 *           .jig-side       左栏，高度按内容（不与表格联动）
 *           .jig-main        右主区
 *             工具条 / 工序轨道 / 表格（表格 flex:1，内部滚）
 * ```
 *
 * **关键：整页不滚，滚的是表格。**
 * 排班三页是「内容滚」，JIG 页是「表格滚」—— 表格有几百行，若让整页滚，
 * 工序轨道与工具条会跟着走，看不到当前范围。所以从 `.canvas-flow` 到
 * `.jig-tab-panel` 每一层都要有确定高度，缺一层表格就长出窗口。
 */
export function JigScreen({ tab, onTabChange, data, config, notify }: JigScreenProps) {
  /**
   * 标红标记由 useJigData 算 —— 显示与导出必须用**同一份**标记，
   * 否则「屏幕上标红的行」与「导出文件里标红的行」会不一致。
   */
  const detailFlags = data.detailFlags
  const drillFlags = data.drillFlags

  /**
   * 切页时清掉下钻。
   *
   * 下钻属于某一张透视表，切到别的页就该退出（否则「在审查页却挂着透视明细」）。
   *
   * 只靠 `from === 当前页` 判断「视觉上退出」是不够的：切走再切回来，下钻还在，
   * 但期间源数据或查询结果可能已经变了，底稿与定位键对不上，
   * 会出现「明细行数与格子上的数字不一致」。所以直接清掉。
   */
  useEffect(() => {
    if (data.drill && data.drill.from !== tab) data.exitDrill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.drill?.from, tab])

  /** 某个页签此刻是否显示下钻明细 */
  const drillOn = (id: JigTabId) => data.drill !== null && data.drill.from === id

  const drillMismatchCount = drillFlags.filter(Boolean).length

  return (
    <div className="canvas is-jig is-pinned">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">JIG 数据</h1>
          <p className="canvas-sub">
            JIG 数据查找与整理
          </p>
        </div>
      </div>

      <div className="canvas-flow">
        <Tabs
          className="jig-tabs"
          onValueChange={value => onTabChange(value as JigTabId)}
          value={tab}
        >
          <TabsList>
            {JIG_TAB_ORDER.map(id => (
              <TabsTrigger key={id} value={id}>
                {JIG_TAB_LABELS[id]}
                {tabCount(id, data) > 0 ? (
                  <span className="jig-tab-badge">{tabCount(id, data)}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {JIG_TAB_ORDER.map(id => (
            <TabsContent className="jig-tab-panel" key={id} value={id}>
              <div className="jig-layout">
                <JigQueryPanel
                  clipboardAutoProcessEnabled={data.prefs.clipboardAutoProcessEnabled}
                  notify={notify}
                  onClear={data.clearQuery}
                  onQuery={data.runQuery}
                  ready={data.ready}
                />

                <div className="jig-main">
                  {/*
                    下钻中：工序轨道与透视工具条都让位给面包屑条。
                    用户此刻看到的是明细，工具条管的是透视表的范围 ——
                    摆在那里会让人以为还能改范围。
                  */}
                  {drillOn(id) ? (
                    <JigDrillBar
                      drill={data.drill!}
                      mismatchCount={drillMismatchCount}
                      onBack={data.exitDrill}
                      rowCount={data.drillTable.rows.length}
                    />
                  ) : (
                    <>
                      {/*
                        工序轨道：透视类页面才显示，因为它读的是总计行的工序分布。
                        位置在工具条**之上** —— 轨道是「当前范围的概览」，
                        工具条是「控制当前范围的手段」，概览在前更顺。
                      */}
                      {id === 'pivot' ? (
                        <JigStageRail config={config} table={data.pivot.table} />
                      ) : null}

                      {id === 'pivot' ? (
                        <JigPivotToolbar
                          avail={data.pivotAvail}
                          availCounts={data.pivot.availCounts}
                          onAvailChange={data.setPivotAvail}
                          onScopeChange={data.setPivotScope}
                          pnOptions={data.pivot.pnOptions}
                          scope={data.pivotScope}
                        />
                      ) : id === 'review' ? (
                        <JigReviewToolbar
                          counts={data.review.counts}
                          onPnChange={data.setReviewPn}
                          onScopeChange={data.setReviewScope}
                          pn={data.reviewPn}
                          pnOptions={data.reviewPnOptions}
                          scope={data.reviewScope}
                        />
                      ) : (
                        <div className="jig-toolbar">
                          <span className="jig-toolbar-label">{viewNote(id, data)}</span>
                          <span className="jig-toolbar-spacer" />
                        </div>
                      )}
                    </>
                  )}

                  {drillOn(id) ? (
                    <JigTable
                      emptyHint="透视表的数字来自已加载的源数据；如果这里为空，请返回并重新加载文件。"
                      emptyTitle="这里没有明细"
                      keywordTotal={config.keywordTotal}
                      mismatchFlags={drillFlags}
                      showRowNumbers
                      sizeColumn="对应尺寸"
                      table={data.drillTable}
                    />
                  ) : id === 'detail' ? (
                    <JigTable
                      emptyHint="先载入源数据，再粘贴 Jig ID 查询。"
                      emptyTitle="尚未查询"
                      keywordTotal={config.keywordTotal}
                      mismatchFlags={detailFlags}
                      showRowNumbers
                      sizeColumn="对应尺寸"
                      table={data.tables.detail}
                    />
                  ) : id === 'queryPivot' ? (
                    <JigTable
                      emptyHint="先载入源数据，再查询一次。"
                      emptyTitle="尚未查询"
                      keywordTotal={config.keywordTotal}
                      table={data.tables.queryPivot}
                      onCellClick={(rowIndex, column) => data.drillTo('queryPivot', rowIndex, column)}
                    />
                  ) : id === 'pivot' ? (
                    <JigTable
                      emptyHint="先在顶栏选择 MES 导出的 Excel 文件。"
                      emptyTitle="尚未载入数据"
                      keywordTotal={config.keywordTotal}
                      table={data.pivot.table}
                      onCellClick={(rowIndex, column) => data.drillTo('pivot', rowIndex, column)}
                    />
                  ) : (
                    <JigTable
                      emptyHint={reviewEmptyHint(data.reviewScope, data.reviewPn)}
                      emptyTitle={reviewEmptyTitle(data.reviewScope, data.reviewPn)}
                      keywordTotal={config.keywordTotal}
                      mismatchFlags={data.review.flags}
                      showRowNumbers
                      sizeColumn="对应尺寸"
                      table={data.review.table}
                    />
                  )}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}

/** 工具条右侧的一句状态说明 */
function viewNote(tab: JigTabId, data: JigData): string {
  if (!data.ready) return '尚未载入源数据'
  return `${tabCount(tab, data)} 行`
}

/**
 * 审查页的空态文案。
 *
 * 分档以后「空」有多种原因 —— 只说「没有符合条件的数据」，用户不知道是
 * 数据真的没问题、还是档位选窄了。所以每一档都要说清「这一档为什么可能为空」
 * 以及「怎么放宽」。
 */
function reviewEmptyTitle(scope: ReviewScope, pn: string): string {
  if (!pn || pn === ALL_PN) {
    return scope === 'all' ? '尚未载入数据' : '当前范围内没有尺寸不匹配的记录'
  }
  return scope === 'all' ? '没有符合条件的数据' : '当前范围内没有尺寸不匹配的记录'
}

function reviewEmptyHint(scope: ReviewScope, pn: string): string {
  if (scope === 'mismatch') {
    return '这一档只保留尺寸对不上的行；切到「所有对象」可看到该范围内的全部记录。'
  }
  if (pn && pn !== ALL_PN) {
    return `换一个 P/N，或把 P/N 切回「全部」。`
  }
  return '先在顶栏选择 MES 导出的 Excel 文件。'
}

/** 各页签的条目数（页签上的徽标） */
function tabCount(tab: JigTabId, data: JigData): number {
  return computeViewCounts(data, tab).byTab[tab]
}
