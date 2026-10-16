// Windows 发布版走 windows_subsystem = "windows"（见 lib.rs），
// 这里不需要单独的主函数。
fn main() {
    shift_schedule_desktop_lib::run()
}
