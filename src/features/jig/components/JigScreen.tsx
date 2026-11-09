import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  JIG_TAB_LABELS,
  JIG_TAB_ORDER,
  type JigTabId
} from './jigTabs'

interface JigScreenProps {
  /** 当前子页：由 App 从 hash 解析后持有 */
  tab: JigTabId
  onTabChange: (tab: JigTabId) => void
}

/**
 * JIG 数据页 —— MES JIG 数据的查询与透视。
 *
 * 与排班的三页不同，这里**没有结算月的概念**：JIG 数据来自 MES 导出的
 * Excel 文件，与哪个月份无关。所以这一页的 hash 不带月份前缀（`#/jig/pivot`），
 * 页头也不放月份导航。
 *
 * 本轮（P2）只搭骨架：页内四段页签、空态、以及与本项目外壳的对齐。
 * 数据读取与四个视图的实际渲染在后续阶段接上。
 */
export function JigScreen({ tab, onTabChange }: JigScreenProps) {
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
        <Tabs
          onValueChange={value => onTabChange(value as JigTabId)}
          value={tab}
        >
          <TabsList>
            {JIG_TAB_ORDER.map(id => (
              <TabsTrigger key={id} value={id}>
                {JIG_TAB_LABELS[id]}
              </TabsTrigger>
            ))}
          </TabsList>

          {JIG_TAB_ORDER.map(id => (
            <TabsContent key={id} value={id}>
              <div className="empty">
                <p className="empty-title">尚未载入数据</p>
                <p className="empty-text">
                  请在顶栏选择 MES 导出的 Excel 文件，载入后此处显示{JIG_TAB_LABELS[id]}。
                </p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
