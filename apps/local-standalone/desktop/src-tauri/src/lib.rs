// 倒班表 · 本地版 —— Tauri 壳。
//
// 壳本身不碰任何业务逻辑：班序展开、成员与改班记录全在前端 src/data/ 里
// （纯 TS，有单测覆盖），这个 crate 只负责开一个窗口、把前端资源挂上去。
//
// 数据存在前端页面的 localStorage 里（键 shift-schedule:local:roster:v2），
// 落在 WebView2 的用户数据目录下。本 crate 不读写任何排班数据 ——
// 真要读写，权限与校验都该在前端数据层收口，而不是散在壳里。
//
// 下面两个插件与 capabilities 里的 dialog/fs 权限：
// - dialog 现在**真的在用** —— 设置页「备份默认存放目录」的原生目录选择器；
// - fs 仍未调用：浏览器的 <a download> 与 <input type=file> 在 WebView2 里都能正常工作
//   （2026-10-27 实测），导入/导出继续走原生路径；当初留 fs 是因为成本为零，
//   将来要做「读某个文件」时可以直接用。写文件走下面自定义的 save_backup_to，
//   因为 fs 的写权限被限制在下载/文档两个目录，而这里要写用户随便挑的目录。
//
// release 版不弹命令行窗口，属性在 main.rs 上（那是应用二进制的入口）；
// debug 构建（tauri dev）保留控制台，便于看启动日志与报错。

use tauri_plugin_dialog::init as init_dialog;
use tauri_plugin_fs::init as init_fs;

/// 把备份写进用户指定的目录，返回完整路径。
///
/// 为什么要自定义命令，而不是用 fs 插件：`capabilities/default.json` 里 fs 的写权限
/// 被刻意限制在 `$DOWNLOAD` / `$DOCUMENT`，而「默认存放目录」允许用户挑 `D:\备份`
/// 这种任意位置 —— 为了这一点把 fs 放开到 `**` 是不划算的。
/// 这个命令的能力面窄得多：只在**已有目录**里写**一个**文件，不读、不遍历、不删。
#[tauri::command]
fn save_backup_to(dir: String, file_name: String, contents: String) -> Result<String, String> {
    // 只接受纯文件名：路径分隔符与 .. 一律拒绝，防止被拼出目录穿越
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("文件名不合法".to_string());
    }

    let dir_path = std::path::PathBuf::from(&dir);
    if !dir_path.is_dir() {
        return Err(format!("目录不存在：{dir}"));
    }

    let target = dir_path.join(&file_name);
    std::fs::write(&target, contents.as_bytes())
        .map_err(|error| format!("写入失败：{error}"))?;

    Ok(target.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 备份导出/导入的原生对话框与文件读写。
        .plugin(init_dialog())
        .plugin(init_fs())
        .invoke_handler(tauri::generate_handler![save_backup_to])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 窗口失败");
}
