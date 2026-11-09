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
 * ## 布局（照搬原项目的 `.work` 两列）
 *
 * ```
 * .canvas.is-jig            通栏铺满，不滚
 *   .jig-work               两列：左输入栏 + 右主区
 *     .jig-side             左栏，全高独立列（不是卡片）
 *       标签行 + 输入框 + 开始查询 + 提示
 *     .jig-main             右主区
 *       .jig-tabs           页签（**只在右栏**，不横跨整页）
 *         .jig-tab-panel    当前页
 *           工序轨道 / 工具条 / 表格（表格 flex:1，内部滚）
 *       .jig-actions        底部导出条（左下角一个大按钮）
 * ```
 *
 * **关键：整页不滚，滚的是表格。**
 * 排班三页是「内容滚」，JIG 页是「表格滚」—— 表格有几百行，若让整页滚，
 * 工序轨道与工具条会跟着走，看不到当前范围。
 *
 * 左栏与右栏各自独立：左栏高度跟着窗口，输入框随之伸缩，不与表格联动。
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

  /** 当前页显示多少行（页签徽标与底栏共用同一个口径） */
  const counts = computeViewCounts(data, tab)

  return (
    <div className="canvas is-jig">
      <div className="jig-work">
        <JigQueryPanel
          clipboardAutoProcessEnabled={data.prefs.clipboardAutoProcessEnabled}
          notify={notify}
          onClear={data.clearQuery}
          onQuery={data.runQuery}
          ready={data.ready}
        />

        <div className="jig-main">
          <Tabs
            className="jig-tabs"
            onValueChange={value => onTabChange(value as JigTabId)}
            value={tab}
          >
            <TabsList>
              {JIG_TAB_ORDER.map(id => (
                <TabsTrigger key={id} value={id}>
                  {JIG_TAB_LABELS[id]}
                  {counts.byTab[id] > 0 ? (
                    <span className="jig-tab-badge">{counts.byTab[id]}</span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>

            {JIG_TAB_ORDER.map(id => (
              <TabsContent className="jig-tab-panel" key={id} value={id}>
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
                    ) : id === 'detail' ? (
                      <div className="jig-toolbar">
                        <JigSizeValidationSwitch
                          checked={data.sizeValidation}
                          mismatchCount={detailFlags.filter(Boolean).length}
                          onChange={data.setSizeValidation}
                        />
                        <span className="jig-toolbar-spacer" />
                      </div>
                    ) : null}
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
              </TabsContent>
            ))}
          </Tabs>

          {/*
            底部导出条：原项目把「导出当前视图」放在内容区底部左下角，
            而不是顶栏 —— 导出的是「你正在看的这张表」，放在表格旁边
            才知道导的是哪张。
          */}
          <div className="jig-actions">
            <Button
              disabled={!data.canExport || counts.current === 0}
              onClick={() => void data.exportCurrent(tab)}
              type="button"
            >
              {data.drill && data.drill.from === tab
                ? '导出透视明细'
                : `导出${JIG_TAB_LABELS[tab]}`}
            </Button>
            <span className="jig-toolbar-spacer" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 「标出尺寸不匹配」开关（查询结果页工具条左侧）。
 *
 * 原项目是自绘的 toggle；这里用原生 checkbox 配样式画一个 ——
 * 语义与可达性都保住了，外观跟原项目一致。
 */
function JigSizeValidationSwitch({
  checked,
  mismatchCount,
  onChange
}: {
  checked: boolean
  mismatchCount: number
  onChange: (on: boolean) => void
}) {
  return (
    <label className="jig-switch">
      <input
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        type="checkbox"
      />
      标出尺寸不匹配
      {checked && mismatchCount > 0 ? (
        <span className="jig-toolbar-note">不匹配 {mismatchCount} 行</span>
      ) : null}
    </label>
  )
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
