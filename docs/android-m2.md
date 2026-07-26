# Android M2 开发文档

> 状态：已完成（2026-07-26）。首页“我的视角”完整落地：人员切换、结算月 tabs、个人月历（农历/节假日标注）、今日班次卡，模拟器端到端验证通过。

## 1. M2 目标与成果

在 M1 的 domain/data 骨架之上，交付可用的“我的排班”首页，并建立应用层架构（DI、ViewModel、主题、组件）。

| 功能 | 实现 |
| --- | --- |
| “我是谁”人员切换 | 右上角人员按钮 → `ModalBottomSheet` 人员列表（13 人，当前人勾选），DataStore 持久化，杀进程重启保持 |
| 结算月 tabs | 5~12 月 `ScrollableTabRow`，默认定位 `getCurrentScheduleMonth`（上月 20 ~ 本月 19 为一个结算月） |
| 个人月历 | 7 列网格：日号 + 班次（语义色+文字）+ 农历/节气/节日标注；今天命令蓝描边；非本月降透明度 |
| 今日班次卡 | 日期 + 农历 + 班次 Chip；周期外显示“不在排班周期” |

## 2. 应用层架构

```
app/
├── ShiftScheduleApp.kt        # Application，持有 AppContainer
├── di/AppContainer.kt         # 手动 DI：AppDatabase + 3 个 Repository（后端替换点）
├── MainActivity.kt            # setContent → HomeRoute
└── ui/
    ├── theme/                 # DESIGN.md token：ShiftColors / Typography / Shapes / ShiftScheduleTheme
    ├── components/            # ShiftChip、MonthCalendar、ScheduleMonthTabs
    └── home/                  # HomeScreen（无状态）+ HomeViewModel
```

- **状态流**：`HomeViewModel.uiState = combine(currentPersonName, selectedMonth)`，纯函数 `buildState` 从 domain 计算全部展示数据；UI 无状态，事件回调（`selectMonth`/`selectPerson`）上行。
- **“我是谁”默认策略**：未设置时取名单第一人（华文达），设置后经 `SettingsRepository`（DataStore）持久化。

## 3. 设计系统落地

- `ShiftChip`：语义色 + 文字，绝不只用颜色（DESIGN.md 硬性规则）。
- 月历单元格三行结构：日号(15sp/800) + 班次(12sp) + 农历标注(10sp)；节假日标注用 Special Day Amber。
- 今日指示：描边 + 日号变蓝（颜色之外的第二指示）。
- 弹层/卡片/圆角遵循 token：卡片 14dp、Chip 全圆角、页面 18dp 内边距。

## 4. 缺陷修复记录（M2 期间）

| 问题 | 根因 | 修复 |
| --- | --- | --- |
| 未来 7 天与今日卡班次矛盾 | 调用方只 drop 了 dates 未 drop shifts，索引错位（M1 骨架期引入） | `MainActivity` 重构时修正，后该功能按需求移除 |
| 农历标注看不见 | 单元格高度不足 + 行高过大 + 对比度低 | 行高收紧、cell 74dp、非假期标注改 inkSoft |
| 必须点按钮下边缘才生效（视觉/触控错位） | targetSdk 36 强制 edge-to-edge，内容被状态栏挤压 | 根布局 `safeDrawingPadding()` |
| uiautomator dump 看不到弹层 | dump 只含焦点窗口，Popup 内容不可见（排查结论，非缺陷） | 改用截图验证弹层交互 |

## 5. 范围变更

- **“未来 7 天”区块已按需求移除**（UI 与 `HomeUiState.upcoming` 同步删除；domain 的 `getUpcomingShifts` 及其测试保留，后续仍可用于其他视图）。

## 6. 验证

- `:app:assembleDebug` 通过；模拟器（AVD `shift`）截图验证：8 月结算月视图、农历标注（大暑/立秋/建军/七夕）、今日描边、人员切换（张舒棋）后整页刷新。
- domain 42/42 测试保持绿色（M2 未改动 domain）。

## 7. 下一步（M3）

- 团队排班表：冻结姓名列 + 横向滚动全员排班，覆盖/法定标记
- 日期编辑：当前用户可编辑自己的班次覆盖/加班/法定/请假，写入 Room（`DayRecordsRepository`）
