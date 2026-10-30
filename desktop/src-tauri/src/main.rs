// Windows 下 release 构建不弹命令行窗口。
//
// 这行属性必须写在 main.rs（应用二进制的入口 crate）上，
// 而不是 build.rs —— build.rs 是构建脚本，是另一个二进制，
// 挂在那里对最终 exe 毫无影响。
//
// 条件是 not(debug_assertions)：cargo tauri dev 用的是 debug 构建，
// 保留控制台才能看到启动日志和报错。release 包才需要藏掉黑框。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shift_schedule_desktop_lib::run()
}
