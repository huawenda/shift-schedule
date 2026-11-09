import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { JigConfig } from '../core/config'
import { rulesFromConfig, validateSizeMatch } from '../core/validate'
import type { JigData } from '../hooks/useJigData'
import { JigQueryPanel } from './JigQueryPanel'
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
 * 四个视图共享同一份源数据（切页不重新读文件），所以左栏的输入与查询结果
 * 在四段之间是通用的 —— 查一次，四段都能看。
 */
export function JigScreen({ tab, onTabChange, data, config, notify }: JigScreenProps) {

  /** 尺寸校验规则：由配置派生一次，四张表共用 */
  const rules = useMemo(() => rulesFromConfig(config), [config])

  /**
   * 查询结果里哪些行尺寸不匹配。
   *
   * 标红是这套数据的核心信息：P/N 的尺寸码与「对应尺寸」对不上，
   * 意味着这张板做不了这个规格。
   */
  const detailFlags = useMemo(() => {
    if (!config.sizeValidationEnabled) return []
    return data.tables.detail.rows.map(row => {
      const size = row['对应尺寸'] ?? ''
      return !validateSizeMatch(row['P/N'] ?? '', size, rules)
    })
  }, [config.sizeValidationEnabled, data.tables.detail.rows, rules])

  const reviewFlags = useMemo(() => {
    if (!config.sizeValidationEnabled) return []
    return data.tables.review.rows.map(row => {
      const size = row['对应尺寸'] ?? ''
      return !validateSizeMatch(row['P/N'] ?? '', size, rules)
    })
  }, [config.sizeValidationEnabled, data.tables.review.rows, rules])

  return (
    <div className="canvas is-jig is-pinned">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">JIG 数据</h1>
          <p className="canvas-sub">
            按 Jig ID 查 MES 导出的 Excel，按 P/N · CST · 工序透视汇总，并核对型号与尺寸是否匹配。
          </p>
        </div>
      </div>

      <div className="canvas-flow">
        <Tabs onValueChange={value => onTabChange(value as JigTabId)} value={tab}>
          <TabsList>
            {JIG_TAB_ORDER.map(id => (
              <TabsTrigger key={id} value={id}>
                {JIG_TAB_LABELS[id]}
              </TabsTrigger>
            ))}
          </TabsList>

          {JIG_TAB_ORDER.map(id => (
            <TabsContent key={id} value={id}>
              <div className="jig-layout">
                <JigQueryPanel
                  notify={notify}
                  onClear={data.clearQuery}
                  onQuery={data.runQuery}
                  ready={data.ready}
                />

                <div className="jig-main">
                  <div className="jig-toolbar">
                    <Button
                      disabled={!data.canPick || data.busy}
                      onClick={() => void data.pickSource()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      浏览…
                    </Button>
                    {data.sourceName ? (
                      <span className="jig-toolbar-note" title={data.sourcePath}>
                        {data.sourceName}
                      </span>
                    ) : null}
                    <span className="jig-toolbar-spacer" />
                    <span className="jig-toolbar-note">{viewNote(id, data)}</span>
                  </div>

                  {id === 'detail' ? (
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
                    />
                  ) : id === 'pivot' ? (
                    <JigTable
                      emptyHint="先在顶栏选择 MES 导出的 Excel 文件。"
                      emptyTitle="尚未载入数据"
                      keywordTotal={config.keywordTotal}
                      table={data.tables.pivotAll}
                    />
                  ) : (
                    <JigTable
                      emptyHint="先在顶栏选择 MES 导出的 Excel 文件。"
                      emptyTitle="尚未载入数据"
                      keywordTotal={config.keywordTotal}
                      mismatchFlags={reviewFlags}
                      showRowNumbers
                      sizeColumn="对应尺寸"
                      table={data.tables.review}
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
  const rows =
    tab === 'detail'
      ? data.tables.detail.rows.length
      : tab === 'queryPivot'
        ? data.tables.queryPivot.rows.length
        : tab === 'pivot'
          ? data.tables.pivotAll.rows.length
          : data.tables.review.rows.length
  return `${rows} 行`
}
