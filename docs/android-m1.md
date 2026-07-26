# Android M1 开发文档

> 状态：已完成（2026-07-26）。`:core:domain` 42/42 测试通过，`:core:data` 编译通过，`:app` 产出 debug APK 并在 Android 16 模拟器运行验证。

## 1. M1 目标与成果

将 monorepo 中 `packages/core`（TypeScript）的排班/统计/薪资/规则逻辑完整移植为原生 Android 工程，搭建可长期演进的模块骨架，并为将来接入后端预留接缝。

| 成果 | 验证方式 |
| --- | --- |
| `:core:domain` 纯 Kotlin 移植 | 42 个单元测试（与 TS 端 `.test.ts` 一一对应）全部通过 |
| `:core:data` Room 本地持久化骨架 | `assembleDebug` 编译通过 |
| `:app` Compose 骨架 + 设计 token 主题 | 模拟器运行截图确认（今日班次/未来 7 天渲染正确） |

## 2. 便携工具链（免管理员、全部在仓库内）

所有工具位于 `.tooling/`（已 gitignore），不污染系统：

| 组件 | 路径 | 版本 |
| --- | --- | --- |
| JDK | `.tooling/jdk21` | Temurin 21.0.11 |
| Gradle | `.tooling/gradle-dist/gradle-8.14.3`（另有 wrapper） | 8.14.3 |
| Android SDK | `.tooling/android-sdk` | platform 36、build-tools 35/36、platform-tools、emulator |
| Gradle 用户目录 | `.tooling/gradle-home` | - |

使用前先注入环境（每次新终端一次）：

```powershell
. .\apps\android\env.ps1   # 设置 JAVA_HOME / ANDROID_HOME / GRADLE_USER_HOME / PATH
```

模拟器：AVD `shift`（Pixel 6，Android 16 google_apis/x86_64）。本机已安装 AEHD 硬件加速驱动；Windows「虚拟机平台」「Windows 虚拟机监控程序平台」已开启，首次重启后 WHPX 亦可使用。

## 3. 工程结构

```
apps/android/
├── settings.gradle.kts          # 模块: :app, :core:domain, :core:data
├── gradle/libs.versions.toml    # 版本目录（全部固定版本）
├── core/domain/                 # 纯 Kotlin/JVM，零 Android 依赖
│   └── src/{main,test}/java/com/shiftschedule/core/
├── core/data/                   # Android Library：Room + DataStore
│   └── src/main/java/com/shiftschedule/data/
└── app/                         # Compose 应用
    └── src/main/java/com/shiftschedule/app/
```

## 4. 锁定版本与选型理由

| 依赖 | 版本 | 理由 |
| --- | --- | --- |
| AGP | 8.13.2 | 8.x 最终版。2026 年新 androidx（core-ktx 1.19+、lifecycle 2.11+）开始强制 AGP 9，8.13 生态最稳 |
| Kotlin / Compose 编译器插件 | 2.3.21 | 与 KSP 2.3.10 对齐 |
| Gradle | 8.14.3 | 满足 AGP 8.13 ≥ 8.13 的要求 |
| core-ktx | 1.18.0 | 兼容 AGP 8.13 的最后版本（1.19 要求 AGP 9.1 + compileSdk 37，已逐一验证 AAR 元数据） |
| lifecycle | 2.10.0 | 同上（2.11 要求 AGP 9.1） |
| compose-bom | 2026.06.01 | ui 1.11.4 / material3 1.4.0 经变体元数据验证兼容 |
| room / navigation / datastore | 2.8.4 / 2.9.8 / 1.2.1 | 变体元数据验证兼容 |
| lunar | 1.7.7 | `cn.6tail:lunar`，与 TS 端 `lunar-javascript` 同作者，数据完全一致 |
| JUnit | 6.1.2 | domain 单测 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 26 | - |

## 5. TS → Kotlin 移植映射

| TS（packages/core/src） | Kotlin（:core:domain） | 说明 |
| --- | --- | --- |
| `types/schedule.ts` | `model/Schedule.kt` | `ShiftType`/`LeaveDuration` 改 enum（中文 label 保留）；`ScheduleMonth` enum 等价于 TS 联合类型 |
| `utils/schedule.ts` | `ScheduleLogic.kt` | 班次汇总、结算月（上月20~本月19）、24 天周期、月历单元格；农历用 `com.nlf.calendar.Solar` |
| `utils/statistics.ts` | `Statistics.kt` | 个人月度统计、全员加班排名（含并列名次） |
| `utils/salary.ts` | `Salary.kt` | `roundMoney` 用 `2.220446049250313e-16` 字面量复刻 JS `Number.EPSILON` 舍入 |
| `utils/legalOvertime.ts` | `LegalOvertime.kt` | - |
| `utils/shiftEditRules.ts` | `ShiftEditRules.kt` | - |
| `utils/shift.ts` | `Shift.kt` | 仅移植 `hasShiftOverrideChanged`（CSS 相关函数不移植） |
| `services/cloudRecordMaps.ts` | `sync/DayRecordMaps.kt` | 覆盖 key 约定 + 云载荷双向映射（后端接缝） |
| `data/schedule.ts` | `data/ScheduleSeed.kt` | 种子排班：**以工作区为准为 13 人**（不含未提交修改中删除的裴辉新） |
| `utils/cloudSync.ts`、`utils/statisticsDemo.ts` | 不移植 | 无后端/无演示需求 |

## 6. 行为等价保障

- **测试即规格**：6 个测试套件 42 个用例与 TS 测试一一对应（`ScheduleSeedTest` 中人数断言按工作区改为 13）。
- **农历/节气**：劳动/立夏/端午/初八/青年/教师等断言全部通过，证明两库数据一致。
- **浮点一致**：薪资用例（28.74/43.1/57.47/86.21/186.78/5158.04 等）全部精确相等。
- 已知差异：Kotlin 端 `ShiftSummary` 用可空字段表达 TS 的可选 key（无数据时为 `null`）。

## 7. 后端预留（纯本地不阻塞，未来零迁移）

1. `core/repository/Repositories.kt` 定义 `DayRecordsRepository` / `SalaryRepository` / `SettingsRepository` 接口；Room/DataStore 仅为一种实现。将来加 Supabase 实现 + 同步协调器，UI 不动。
2. Room 表名/列名与 `docs/supabase-schema.sql` 完全一致（`day_shift_overrides`、`day_private_records`、`salary_inputs`），含 `updated_at_ms`。
3. `sync/DayRecordMaps.kt` 保留云载荷双向映射（`buildDayRecords` / `recordsToOverrides` / `hasDayRecordChanged`）。

## 8. 构建与运行

```powershell
. .\apps\android\env.ps1
cd apps\android

gradle :core:domain:test          # domain 单测
gradle :app:assembleDebug         # 构建 APK

emulator -avd shift -no-snapshot-save                       # 启动模拟器
adb install -r app\build\outputs\apk\debug\app-debug.apk    # 安装
adb shell am start -n com.shiftschedule.app/.MainActivity   # 启动
```

## 9. 已知事项

1. TS 端 `packages/core/src/data/schedule.test.ts` 仍断言 14 人，与工作区 13 人不一致（未提交修改进行中），`pnpm test:core` 会红。
2. `gradlew` 首次运行需联网下载发行版；离线时可用 `env.ps1` 注入的本地 `gradle` 命令。
3. Windows 两个虚拟化功能需重启一次后完全生效；当前 AEHD 驱动已独立可用。
4. 路径含空格曾导致 emulator/sdkmanager 问题，已通过 8.3 短路径规避（`env.ps1` 已处理）。

## 10. M2 计划

- “我是谁”人员选择（DataStore 持久化）+ 结算月 tabs 的个人月历首页
- 后续：M3 团队排班表 + 编辑；M4 统计/图表/薪资；M5 打磨（空态/无障碍/横滚提示）
