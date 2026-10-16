// 注意：控制台窗口的控制权在 main.rs 的
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]，
// 不在这里 —— 本文件是构建脚本，属性挂上去对最终 exe 无效。

fn main() {
    tauri_build::build()
}
