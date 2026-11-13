import { useEffect } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { JigConfig } from '../core/config'
import type { ReviewScope } from '../core/review'
import { ALL_PN } from '../core/reviewView'
import type { JigData } from '../hooks/useJigData'
import { JigDrillBar } from './JigDrillBar'
import { JigPivotToolbar } from './JigPivotToolbar'
import { JigQueryPanel } from './JigQueryPanel'
import { JigReviewToolbar } from './JigReviewToolbar'
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

  /**
   * 加载完成后决定停在哪一页。
   *
   * - **没查过**（输入框是空的 / 填了但没点「开始查询」）→ 跳「全量透视」。
   *   没有查询结果可看，全量透视是唯一有内容的视图 —— 停在空白的
   *   「查询结果」页等于没反应。
   * - **查过** → 跳「查询结果」。热加载后结果已按新数据重算，跳过去正好看到。
   *
   * 判据是「**查过没有**」而不是「输入框里有没有字」：填了 ID 但没点
   * 「开始查询」时，输入框非空但结果仍是空的 —— 按后者判会跳到空页。
   */
  useEffect(() => {
    if (data.loadCount === 0) return
    const hasResult = data.tables.detail.rows.length > 0
    onTabChange(hasResult ? 'detail' : 'pivot')
    // 只在「刚加载完」这一刻跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loadCount])

  /** 某个页签此刻是否显示下钻明细 */
  const drillOn = (id: JigTabId) => data.drill !== null && data.drill.from === id

  const drillMismatchCount = drillFlags.filter(Boolean).length

  /**
   * 跑查询，查成了就跳到「查询结果」页。
   *
   * 查询的结果在「查询结果」页 —— 停在别的页签上，用户点了查询却看不到
   * 任何变化，会以为没生效。查都没查成（没源数据 / 没填 ID）时不跳：
   * 跳过去是空表,只会让人更困惑。
   */
  const runQuery = (ids: string[]) => {
    if (data.runQuery(ids)) onTabChange('detail')
  }

  return (
    <div className="canvas is-jig">
      <div className="jig-work">
        <JigQueryPanel
          clipboardAutoProcessEnabled={data.prefs.clipboardAutoProcessEnabled}
          notify={notify}
          onClear={data.clearQuery}
          onQuery={runQuery}
          onValueChange={data.setQueryInput}
          ready={data.ready}
          value={data.queryInput}
        />

        <div className="jig-main">
          <Tabs
            className="jig-tabs"
            onValueChange={value => onTabChange(value as JigTabId)}
            value={tab}
          >
            {/*
              顶行：**页签贴左**（与下面表格的左缘对齐），**工具条靠右**
              （下拉过滤 + 分段计数相邻）。

              DOM 顺序也是「页签在前」：靠右靠的是工具条（它带 margin-left:auto），
              顺序反了的话会把「工具条 + 页签」整段推到右边去。

              工具条随页签切换（全量透视 / 数据审查各有一套，其余页签没有）；
              下钻时这一行换成面包屑，占满整行 —— 页签仍在原位，随时能切走。
            */}
            <div className="jig-head">
              {/*
                页签与「成员分组 / 矩阵分组」共用同一套胶囊（`.chip-tabs` / `.chip-tab`）：
                同一个应用里出现第三种页签形态是最扎眼的不一致。
                选中态由 Radix 的 data-state 标，样式块里两种写法都认。
              */}
              <TabsList className="chip-tabs jig-head-tabs">
                {JIG_TAB_ORDER.map(id => (
                  <TabsTrigger className="chip-tab" key={id} value={id}>
                    {JIG_TAB_LABELS[id]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {drillOn(tab) ? (
                <JigDrillBar
                  drill={data.drill!}
                  mismatchCount={drillMismatchCount}
                  onBack={data.exitDrill}
                  rowCount={data.drillTable.rows.length}
                />
              ) : tab === 'pivot' ? (
                <JigPivotToolbar
                  avail={data.pivotAvail}
                  availCounts={data.pivot.availCounts}
                  onAvailChange={data.setPivotAvail}
                  onScopeChange={data.setPivotScope}
                  pnOptions={data.pivot.pnOptions}
                  scope={data.pivotScope}
                />
              ) : tab === 'review' ? (
                <JigReviewToolbar
                  counts={data.review.counts}
                  onPnChange={data.setReviewPn}
                  onScopeChange={data.setReviewScope}
                  pn={data.reviewPn}
                  pnOptions={data.reviewPnOptions}
                  scope={data.reviewScope}
                />
              ) : null}
            </div>

            {JIG_TAB_ORDER.map(id => (
              <TabsContent className="jig-tab-panel" key={id} value={id}>
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
        </div>
      </div>
    </div>
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
