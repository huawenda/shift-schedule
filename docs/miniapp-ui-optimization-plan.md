# 小程序布局与样式优化方案

日期：2026-10-24
依据：`docs/miniapp-ui-audit.md` Round 3 审计（新三页架构）
范围：**布局与样式**。P0-1（数据层共享）、P0-2（绑定逻辑）、P3-5（输入防抖）属逻辑改动，不在本方案内；但它们的 **UI 落位**（绑定弹层、同步状态、统计页月份切换）在本方案批次 D 中给出，可先按现有 hook 接口实现，数据层重构后无需改样式。

## 0. 原则

1. **不动设计语言 v2 的基因**：tokens 的卡片体系、两档投影、班次语义色值（`$s-day` 等 6 色本体）、「班次色只做标记不做整格填色」全部保留。本方案只调**辅助色的对比度**、**尺寸**与**行为**。
2. **每批独立可验证、可单独提交**：A 纯样式 → B 触控 → C 布局行为 → D 带逻辑的布局位。批内改动互不依赖。
3. **所有按压态继续只改 transform/opacity**（Round 2 §9 规则），本方案不引入任何改尺寸的 hover 类。
4. 数值改动必须**成对同步**的地方（矩阵行高、表头/内容列宽）在表中显式列出，防止重蹈 R1 P0-1 覆辙。

---

## 1. 设计令牌层（`styles/tokens.scss`）

| 项 | 现值 | 改为 | 理由 |
|---|---|---|---|
| `$ink-3` | `#94a3b8` | `#556070` | 现值白卡上 2.6:1 / 页面底上 2.3:1，大量 11-12px 信息文字在用（审计 P2-3）。`#556070` 白卡 6.4:1、页面底 5.6:1，仍比 `$ink-2`（#475569）浅一档，层级不塌 |
| 新增 `$s-ot` | — | `#d97706` | 平日加班标记色。现用 `$s-rest` 绿与休息撞色且与 Web（纸白点）语义相悖（P2-1）。白底上 3.2:1，满足 WCAG 1.4.11 非文字元素 3:1；原绿色仅 2.5:1 不达标 |

> `$ink-3` 改动会波及全部辅助文字（block-title-sub、stats-sub、top-meta、mx-title-sub、week-wd、cal-user-group、dlg-label、legend-text 等），预期整体变深一档——这是有意的。实施后按 §6 对比度表逐项复核，若观感过重，可为「纯装饰性文字」（如 legend-text）单独回落到旧值，但信息型小字必须 ≥4.5:1。

---

## 2. 批次 A：纯样式（约 60 行 diff，3 个文件）

### A1 「未来 7 天」色标统一为浅底徽章（P2-2）

`pages/today/index.scss` `.week-mark`（:180-195）从「班次实心色 + 白字」改为复用全局 m-* 浅底徽章；`pages/today/index.tsx:86` 的 `getShiftClass(item.shift)`（s-*）换成 mark 类（m-*）。

```scss
// 改后
.week-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 5px;
  border-radius: 7px;
  font-size: 10px;
  font-weight: 700;
}
.week-mark.is-empty { background: transparent; }
// 颜色/字色全部来自全局 .m-day/.m-night/... 类，本文件不再声明白字
```

一次性解决两个问题：白字在 `#f59e0b`（2.1:1）/`#10b981`（2.5:1）上的对比度失败，以及同一班次在今日页与月历/矩阵的两套呈现。

### A2 加班点换色 + 图例补说明（P2-1）

- `app.scss` `.mx-dot`（:377-385）：`background: t.$s-rest` → `t.$s-ot`；`.mx-dot.is-legal` 保持 `$danger`。
- `pages/calendar/index.scss` 图例区（:146-170）补两项，样式加圆点变体：

```scss
.legend-dot.is-round {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.legend-dot.is-ot    { background: t.$s-ot; }
.legend-dot.is-legal { background: t.$danger; }
```

`pages/calendar/index.tsx` 图例（:152-159）在六个班次后追加「加班」「法定」两项（Web 端 `schedule.scss:290` 的 legend-marks 同源做法）。

### A3 hero 辅助文字提亮（P3-7）

`pages/today/index.scss`：`.hero-state` 与 `.hero-cd-label` 的 `rgba(255,255,255,0.72)` → `0.85`；`.hero-cd-unit` 与 `.hero-range` 的 `0.8/0.82` → `0.88`。10-12px 小字在 `#2563eb` 上的对比度从约 3.5:1 提到 4.5:1 上下。

### A4 消除 MARK_CLASS 双份定义（代码卫生，随 A1 顺手做）

`MARK_CLASS` 现在在 `pages/calendar/index.tsx:13-20` 与 `components/TeamMatrix.tsx:22-29` 各有一份，A1 之后今日页也要用，将变成三份。上提到 `appConstants.ts`：

```ts
export const markClassMap: Record<ShiftType, string> = { 白班: 'm-day', /* ... */ }
export function getMarkClass(shift: ShiftType): string { return markClassMap[shift] }
```

三处 import，删除两份局部定义。

---

## 3. 批次 B：触控目标与按压反馈（约 40 行 diff，2 个文件）

### B1 尺寸表（审计 P2-4）

| 选择器 | 文件:行 | 现值 | 改为 | 同步项（必须一起改） |
|---|---|---|---|---|
| `.mx-cell` | calendar/index.scss:355-364 | 高 32 | 高 **36** | `.mx-name` 高 32→**36**（:285-291，行高两侧必须一致，组件注释已立规） |
| `.mx-mark` | calendar/index.scss:366-375 | 34×26 | **36×30** | 无（by-name 模式宽度 52 不动） |
| `.seg-item` | calendar/index.scss:250-256 | padding 5px 12px（高≈26） | padding **7px 14px**（高≈30） | `.seg` 容器 padding 3px 不动 |
| `.chip` | app.scss:190-203 | padding 8px 14px（高≈34） | padding **10px 14px**（高≈38） | `.chips` 换行间距随之自然增大，无需另调 |
| `.cal-arrow` | calendar/index.scss:16-28 | 32×32 | **36×36** | line-height 32→36；字号 18 不动 |

矩阵行高 35→39 后整卡高度约 +52px（13 行），仍远小于一屏，可接受；触点从 37×31 实测提到约 40×35，向 44px 靠拢但不牺牲密度（矩阵密度是产品取舍，R1 §5-1 已记录）。

### B2 按压反馈条件化（P3-1）

`hoverClass="none"` 即禁用（微信语义）。三处「点了没结果」的元素改为条件式：

| 元素 | 位置 | 改法 |
|---|---|---|
| 月份箭头 | calendar/index.tsx:93-107 | `hoverClass={禁用方向 ? 'none' : 'press-dim'}` |
| 人员入口 | calendar/index.tsx:109-116 | 非管理员时 `'none'`（批次 D 会给未绑定用户接绑定层，届时该条件改为「管理员或未绑定」） |
| 非当月日历格 | calendar/index.tsx:126-131 | `cell.inCurrentMonth ? 'press-cell' : 'none'` |

---

## 4. 批次 C：布局行为（约 80 行 diff，3 个文件）

### C1 矩阵自动定位到今天（P1-2）

用 ScrollView 自带 `scroll-into-view`，不做任何几何估算（R2 #4 的教训：估算常量必漂移）。

- `components/TeamMatrix.tsx`：表头行 today 列加 id —— `className` 判定 `label.date === todayKey` 时同时输出 `id="mx-today"`；ScrollView 增加：

```tsx
<ScrollView
  scrollX enhanced showScrollbar={false}
  className="mx-scroll"
  scrollIntoView="mx-today"
  scrollWithAnimation={false}
>
```

- 切换 `mode`（38↔56 列宽）时 today 列位置变化，`scroll-into-view` 由渲染层自动重定位，无需额外处理；若实测个别基础库不跟随，再在 `useEffect([mode])` 里重设一次属性值。
- 边界：当月不含今天（浏览非当月）时无 `mx-today` 节点，属性自动失效，停留在第 1 列——正确行为。

### C2 非当月时隐藏「今天同班」区块（P1-3，取三选一中最简方案）

`pages/calendar/index.tsx:161-174`：`todayIndex < 0` 时整个 block-title + mates 不渲染。比改文案更诚实（「今天没有排班记录」是错误陈述），比「显示所选月 1 日同班」少一个概念。浏览回当月自动恢复。

### C3 月份文字可点回当月（P3-2）

`calendar/index.tsx:100` 的 `Text.cal-month-text` 改为 `View` + `hoverClass="press-dim"`，onClick `setActiveMonth(当前月)`（`getCurrentScheduleMonth(scheduleData, new Date())`）。非当月时可加视觉暗示（可选）：文字右侧 6px 圆点 `$brand`，当月时不显示。

### C4 月历滑动手势（P3-3，可选，建议做）

今日页副标题「滑动月历可看整月」（today/index.tsx:78）指向一个不存在的手势。两个方案二选一：

- **最小**：文案改「点『月历』查看整月」，零风险；
- **推荐**：给 `.cal-card` 补左右滑切月。必须用 R2 #1 验证过的正确写法——`onTouchStart` 存 ref、`onTouchEnd` 读 **`changedTouches`**（touchend 时 `touches` 已清空）：

```tsx
const touchStart = useRef<{ x: number; y: number } | null>(null)
// onTouchStart: touchStart.current = { x: e.changedTouches[0]?.clientX ?? 0, y: ... }
// onTouchEnd:   dx = e.changedTouches[0].clientX - start.x; dy = ...
//               Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 → switchMonth(dx < 0 ? 1 : -1)
```

若做手势则今日页文案不动。

---

## 5. 批次 D：带逻辑的布局位（约 150 行 diff，依赖现有 hook 接口）

> 这一批的**样式与落位**现在就可以做，逻辑挂到 `useScheduleData` 现有导出（`refresh`/`refreshing`/`cloudSyncBlocked`/`needsBinding`/`bindProfile`）上；P0-1 数据层共享完成后无需改样式。

### D1 同步状态胶囊（P0-3 的 UI 面）

新组件 `components/SyncPill.tsx` + `app.scss` 样式，**放在月历页 `cal-top` 中部**（数据编辑发生地；今日页/统计页只读，不放）：

```scss
.sync-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: t.$r-pill;
  background: t.$card;
  box-shadow: t.$shadow-card;
  font-size: 11px;
  color: t.$ink-2;
}
.sync-pill .dot { width: 6px; height: 6px; border-radius: 50%; }
.sync-pill.is-syncing .dot { background: t.$ink-3; }
.sync-pill.is-ok      .dot { background: t.$s-rest; }
.sync-pill.is-err     .dot { background: t.$danger; }
```

状态映射：`refreshing || !cloudSyncReady` → 同步中；`cloudSyncBlocked` → 「同步失败」+ 可点（hover press-dim）调 `refresh()`；否则 → 「已同步」。`!profileReady || needsBinding` 时不渲染。横向预算：月份步进器约 130px + 胶囊约 78px + 人员 chip 约 90px ≈ 298px < 版心 343px，放得下；若实机拥挤，胶囊退到 cal-top 下方独立一行。

### D2 统计页月份步进器（P1-1 的 UI 面）

把月历页的 `‹ 10月 ›` 步进器升为共享样式：`.cal-arrow/.cal-month-text` 从 `pages/calendar/index.scss` **上提到 app.scss**（改名 `.step-arrow/.step-label`，月历页改引用），统计页 `stats-top` 左侧用同一组件替换纯文字标题：

```
[‹] 10月 [›]        ← step-arrow / step-label（禁用态逻辑与月历页一致）
姓名 · 班组          |  22.5 小时加班
```

月份状态用统计页自己的 `activeMonth/setActiveMonth`。管理员人员切换入口（Web 有「选择用户」）暂不做——等 P0-2 绑定层一起设计权限入口，避免做两遍。

### D3 绑定弹层（P0-2 的 UI 面）

复用现有 `dlg/dlg-body/pick-row` 弹层语言（零新样式），在月历页加第二个弹层实例：

- 触发：`needsBinding` 时（a）`cal-user` chip 常驻 `$brand` 描边提示 + 可点（管理员仍走人员切换）；（b）页面首次 `useDidShow` 自动弹一次，用户关闭后不再自动弹。
- 内容：标题「绑定我的姓名」/ 副标题「选择你在排班表中的名字，之后只能查看和修改本人的记录」+ 人员列表（pick-row）。
- 确认调 `bindProfile(personName)`（hook 已导出），失败 toast「绑定失败，请稍后重试」（旧版文案）。

---

## 6. 验证方案

1. **每批结束**：`pnpm typecheck:miniapp`；批次 C/D 后跑 `pnpm test:miniapp`。
2. **实机截图复测**（`.automator`，方法见审计 §7.4 `run.cmd`），重点量：
   - 矩阵按班次/按姓名：表头步进 = 内容步进（54/54 的对齐不能因行高改动回退——行高两侧同步改即安全，仍须实测确认）；
   - today 列定位：截图里 today 列应出现在矩阵可视区（不再是第 1 列起）；
   - 周条徽章、图例、同步胶囊、统计页步进器各一张；
   - 触控尺寸：`.mx-cell` 折算后约 40×35。
3. **对比度复核表**（改动项的验收值）：

| 项 | 改前 | 验收值 |
|---|---|---|
| `$ink-3` 信息文字 on 白卡 | 2.6:1 | ≥ 4.5:1 |
| `$ink-3` 信息文字 on 页面底 | 2.3:1 | ≥ 4.5:1 |
| 周条徽章字 vs 底（白/休两档抽查） | 2.1 / 2.5:1 | ≥ 4.5:1 |
| 加班点 on 白卡 | 2.5:1 | ≥ 3:1（非文字） |
| hero 辅助文字 on 品牌蓝 | ≈ 3.5:1 | ≥ 4.5:1 |

4. **回归红线**：R1 修复不能回退——按姓名视图步进一致性、press-* 只改 transform/opacity、`status-cover` 与 `dlg` 层级（z-index 10/50/100）不动。

## 7. 批次总览与顺序

| 批 | 内容 | 规模 | 风险 | 依赖 |
|---|---|---|---|---|
| A | 徽章统一 / 加班点色 / 图例 / hero 提亮 / 令牌 | ~60 行，3 文件 | 低（纯视觉） | 无 |
| B | 触控尺寸表 / hover 条件化 | ~40 行，2 文件 | 低-中（行高成对改） | 无 |
| C | 矩阵定位今天 / 隐藏非当月同班 / 月份回当月 / 滑动手势 | ~80 行，3 文件 | 中（行为改动需实机验证） | 无 |
| D | 同步胶囊 / 统计页步进器 / 绑定弹层 | ~150 行，4-5 文件 | 中（挂逻辑） | 仅依赖现有 hook 导出；P0-1 完成后样式不变 |

建议顺序 A → B → C → D，每批一个 commit。A/B 合并提交也可（同为低风险样式）。批次 D 的三个子项彼此独立，可拆可合。

## 8. 明确不做（本轮）

- 班次语义色 6 色本体、卡片圆角/投影、间距节奏——设计基因，不动。
- 矩阵列宽（38/56）与信息密度进一步放宽——密度是产品取舍，触控改善到 40×35 即止。
- `prefers-reduced-motion`——平台不支持（R1 §5-2 已记录），现有动效均为 90-160ms 微动效，无降级必要。
- 跨月补齐「未来 7 天」（P3-4）——需要跨月数据合并，收益低；标题随剩余天数改写（「本月剩余 N 天」）作为最小改法留待顺手做。
