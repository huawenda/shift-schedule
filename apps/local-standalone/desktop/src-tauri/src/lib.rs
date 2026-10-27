// 倒班表 · 本地版 —— Tauri 壳。
//
// 壳本身不碰任何业务逻辑：班序展开、成员与改班记录全在前端 src/data/ 里
// （纯 TS，有单测覆盖），这个 crate 只负责开一个窗口、把前端资源挂上去。
//
// 数据存在前端页面的 localStorage 里（键 shift-schedule:local:roster:v2），
// 落在 WebView2 的用户数据目录下。本 crate 不读写任何排班数据 ——
// 真要读写，权限与校验都该在前端数据层收口，而不是散在壳里。
//
// 下面两个插件（dialog / fs）与 capabilities 里的 dialog/fs 权限**目前是未调用的代码路径**：
// 2026-10-27 在 release 壳内实测，浏览器的 <a download> 与 <input type=file>
// 在 WebView2 里都能正常工作（导出落盘、导入替换成员都通过），
// 所以前端 src/data/backup.ts 继续走原生路径，没接 Tauri 对话框。
// 留着插件是因为成本为零：将来要做「另存到指定目录」之类，前端直接用
// window.__TAURI__（withGlobalTauri 已开）即可，不必再改 Rust 侧。
//
// release 版不弹命令行窗口，属性在 main.rs 上（那是应用二进制的入口）；
// debug 构建（tauri dev）保留控制台，便于看启动日志与报错。

use tauri_plugin_dialog::init as init_dialog;
use tauri_plugin_fs::init as init_fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 备份导出/导入的原生对话框与文件读写。
        .plugin(init_dialog())
        .plugin(init_fs())
        .run(tauri::generate_context!())
        .expect("启动 Tauri 窗口失败");
}
