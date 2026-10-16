// 倒班表 · 本地版 —— Tauri 壳。
//
// 壳本身不碰任何业务逻辑：排班、统计、薪资计算全部在 src/ 那份 React 里，
// 这个 crate 只负责开一个窗口、把前端资源挂上去。
//
// 数据仍然存在前端页面的 localStorage 里（键 shift-schedule:local:*），
// 落在 WebView2 的用户数据目录下。本 crate 不读写任何排班数据 ——
// 真要读写，权限与校验都该在前端数据层收口，而不是散在壳里。
//
// release 版不弹命令行窗口，属性在 main.rs 上（那是应用二进制的入口）；
// debug 构建（tauri dev）保留控制台，便于看启动日志与报错。

use tauri_plugin_dialog::init as init_dialog;
use tauri_plugin_fs::init as init_fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 备份导出/导入：静态版靠 <a download> 与 <input type=file>，
        // 在壳里这两条都会被 WebView2 的下载策略拦掉，
        // 前端改用 Tauri 的原生保存/打开对话框，走这两个插件。
        .plugin(init_dialog())
        .plugin(init_fs())
        .run(tauri::generate_context!())
        .expect("启动 Tauri 窗口失败");
}
