// Workhorse —— Tauri 壳。
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

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_dialog::init as init_dialog;
use tauri_plugin_fs::init as init_fs;

/// 关闭按钮行为。
///
/// 默认 `false` = 直接退出，保持加托盘之前的行为；
/// 用户可在设置页改成 `true` = 隐藏到托盘，由前端通过 `set_close_to_tray` 同步。
struct ClosePrefs(AtomicBool);

#[tauri::command]
fn set_close_to_tray(state: State<'_, ClosePrefs>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

/// 从托盘 / 菜单唤回主窗口：先显示、再取消最小化、最后聚焦。
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 窗口装饰配色：跟着前端主题走。
///
/// 窗口已改为无边框（`decorations: false`），标题栏由前端自绘，
/// caption / text 两个 DWM 属性不再有可见对象；这里保留调用，是因为
/// `DWMWA_USE_IMMERSIVE_DARK_MODE` 仍决定系统绘制的边框与阴影深浅，
/// `DWMWA_BORDER_COLOR` 也仍作用于无边框窗口的 1px 系统边线。
/// - 颜色与画布侧的外壳对齐：浅 `#ffffff` / 深 `#202020`（侧栏与标题栏同色）；
/// - 窗口阴影与 Win11 圆角由 Tauri `shadow` 的默认值（true）保留。
#[cfg(target_os = "windows")]
fn paint_caption(window: &tauri::WebviewWindow, dark: bool) {
    use std::ffi::c_void;

    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        DWMWA_USE_IMMERSIVE_DARK_MODE,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    // COLORREF = 0x00BBGGRR：浅 #ffffff / #1f2328，深 #202020 / #ececec
    let (caption, text) = if dark {
        (0x0020_2020_u32, 0x00EC_ECEC_u32)
    } else {
        (0x00FF_FFFF_u32, 0x0028_231F_u32)
    };
    let border = caption;
    let immersive = if dark { 1_i32 } else { 0_i32 };

    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &immersive as *const i32 as *const c_void,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            &caption as *const u32 as *const c_void,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR,
            &text as *const u32 as *const c_void,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &border as *const u32 as *const c_void,
            4,
        );
    }
}

/// 前端主题变化时同步窗口：immersive dark mode / 边框色 + WebView 原生控件一起换。
///
/// 只改窗口装饰，不碰任何业务数据。前端在 `applyTheme()` 与 index.html 的
/// 首帧脚本里各调一次（后者避免深色用户启动时先闪一帧浅色窗口底色）；
/// 浏览器 / 静态版里没有 `__TAURI__`，调用点会直接跳过。
#[tauri::command]
fn set_window_theme(app: tauri::AppHandle, dark: bool) {
    let theme = if dark {
        tauri::Theme::Dark
    } else {
        tauri::Theme::Light
    };
    if let Some(window) = app.get_webview_window("main") {
        // WebView2 里的原生控件（滚动条、输入框、右键菜单）跟着一起换，
        // 否则暗色页面上会浮着一条浅色滚动条。
        let _ = window.set_theme(Some(theme));
        #[cfg(target_os = "windows")]
        paint_caption(&window, dark);
    }
}

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

/// 读一个用户选中的文件，把内容原样返回给前端。
///
/// JIG 数据页要读 MES 导出的 Excel：用户在原生对话框里挑一个文件，
/// 前端拿到路径后调这个命令把字节读回来。
///
/// 为什么要自定义命令，而不是用 fs 插件的 `readFile`：
/// `capabilities/default.json` 里 fs 的读权限被刻意限制在 `$DOWNLOAD` /
/// `$DOCUMENT` 两个目录，而 MES 导出的文件通常躺在 D 盘、桌面上或某个
/// 车间共享盘里 —— 为了读这一个文件把 fs 放开到 `**` 并不划算。
/// 这个命令的能力面窄得多：**只读一个已存在的文件**，不遍历目录、
/// 不读目录列表、不写、不删。
///
/// 大文件也没有上限：MES 导出的表格几百行到几千行，几百 KB 到几 MB，
/// 一次读进内存交给前端的 xlsx 解析完全够用。
#[tauri::command]
fn read_picked_file(path: String) -> Result<Vec<u8>, String> {
    let file_path = std::path::PathBuf::from(&path);

    if !file_path.is_file() {
        return Err(format!("文件不存在：{path}"));
    }

    std::fs::read(&file_path).map_err(|error| format!("读取失败：{error}"))
}

/// 把剪贴板里的文本读出来。
///
/// JIG 页的「粘贴 Jig ID」要能从邮件正文里自动挑出 ID —— 那是系统级
/// 剪贴板的内容，不是网页能拿到的：WebView2 里 `navigator.clipboard.readText`
/// 在 onPaste 事件里基本必被拒绝（需要额外的用户激活与权限）。
/// 所以走 clipboard-manager 插件，读的是真正的系统剪贴板。
///
/// 剪贴板里没有文本时返回空串而不是报错 —— 界面据此按「按原文粘贴」处理。
#[tauri::command]
fn read_clipboard_text(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    app.clipboard()
        .read_text()
        .map_err(|error| format!("读取剪贴板失败：{error}"))
}

/// JIG 配置文件路径：`<app_config_dir>/jig-config.json`。
///
/// 与排班数据不同：排班仍在 WebView2 的 localStorage 里，而 JIG 的业务配置
/// 与本机偏好落到用户配置目录下的独立 JSON —— 便于备份、排查，也能被用户直接看到。
fn jig_config_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("定位配置目录失败：{error}"))?;
    Ok(dir.join("jig-config.json"))
}

/// 读 JIG 配置文件。文件不存在返回 `None`，由前端落回默认值。
#[tauri::command]
fn read_jig_config(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = jig_config_file(&app)?;
    match std::fs::read_to_string(&file) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取 JIG 配置失败：{error}")),
    }
}

/// 写 JIG 配置文件（内容由前端序列化好）。
#[tauri::command]
fn write_jig_config(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let file = jig_config_file(&app)?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("创建配置目录失败：{error}"))?;
    }
    std::fs::write(&file, contents).map_err(|error| format!("写入 JIG 配置失败：{error}"))
}

/// 把二进制内容写进用户选定的路径，返回完整路径。
///
/// JIG 页要导出 Excel：用户在原生「另存为」对话框里挑好路径与文件名，
/// 前端把 xlsx 的字节交给这个命令落盘。
///
/// 能力面与 `save_backup_to` 对称：**只写用户自己指定的那一个文件**，
/// 不遍历目录、不写别处、不删。
///
/// 为什么不用 fs 插件的 `writeFile`：fs 的写权限被刻意限制在 `$DOWNLOAD` /
/// `$DOCUMENT`，而用户可能要把报告存到 D 盘或共享盘。为一个导出文件
/// 把 fs 放开到 `**` 不划算。
#[tauri::command]
fn save_jig_export(path: String, contents: Vec<u8>) -> Result<String, String> {
    let target = std::path::PathBuf::from(&path);

    // 路径必须是用户选定的完整文件路径，且父目录存在。
    // 不接受空路径，也不接受指向目录的路径。
    if path.is_empty() {
        return Err("未选择保存位置".to_string());
    }
    if target.is_dir() {
        return Err("这是一个目录，不是文件名".to_string());
    }
    let parent = match target.parent() {
        Some(p) => p,
        None => return Err("路径不合法".to_string()),
    };
    if !parent.is_dir() {
        return Err(format!("目录不存在：{}", parent.to_string_lossy()));
    }

    std::fs::write(&target, &contents).map_err(|error| format!("写入失败：{error}"))?;

    Ok(target.to_string_lossy().into_owned())
}

/// 真正退出应用（不是「隐藏到托盘」）。
///
/// 侧栏底部的用户菜单里点「退出应用」走这条命令：关闭按钮的行为可能被
/// 用户设成「隐藏到托盘」，但菜单里的「退出」语义就是结束进程，
/// 所以直接 `app.exit(0)`，不经窗口关闭事件。
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例必须第一个注册：第二次双击 exe 时，新进程把参数交给这里后立即退出，
        // 已有实例则把窗口从托盘 / 最小化状态唤回前台。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .manage(ClosePrefs(AtomicBool::new(false)))
        // 备份导出/导入的原生对话框与文件读写。
        .plugin(init_dialog())
        .plugin(init_fs())
        // 系统剪贴板读取：JIG 页从邮件正文里挑 Jig ID 用。
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // 初始按浅色画；真实主题由前端首帧脚本立刻同步过来。
                    // 深色用户不会停在一条浅色系统边框 / 阴影上。
                    paint_caption(&window, false);
                }
            }

            let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏主窗口", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &separator, &quit])?;

            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                // 左键留给「显示并聚焦」，右键才弹菜单
                .show_menu_on_left_click(false)
                .tooltip("Workhorse")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let visible = window.is_visible().unwrap_or(true);
                            if visible {
                                let _ = window.hide();
                            } else {
                                show_main_window(app);
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        // 关闭按钮：设置为「隐藏到托盘」时拦截关闭，只隐藏窗口；
        // 其它情况保持默认行为 —— 关掉最后一个窗口即退出进程。
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let prefs = window.state::<ClosePrefs>();
                if prefs.0.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            save_backup_to,
            set_close_to_tray,
            set_window_theme,
            read_picked_file,
            read_clipboard_text,
            save_jig_export,
            read_jig_config,
            write_jig_config,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 窗口失败");
}
