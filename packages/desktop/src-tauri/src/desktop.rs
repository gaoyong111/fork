/**
 * 桌面原生能力：系统托盘、全局快捷键、窗口拖放、Deep Link 转发
 */
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MENU_SHOW: &str = "tray_show";
const MENU_QUICK_SAVE: &str = "tray_quick_save";
const MENU_QUIT: &str = "tray_quit";

/** 显示并聚焦主窗口 */
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/** 解析 favorites:// 或 CLI 参数中的 URL */
fn extract_url_from_args(args: &[String]) -> Option<String> {
    for arg in args {
        if let Some(rest) = arg.strip_prefix("favorites://") {
            if let Ok(parsed) = url::Url::parse(&format!("favorites://{rest}")) {
                if let Some(q) = parsed.query() {
                    for pair in q.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        if parts.next() == Some("url") {
                            if let Some(encoded) = parts.next() {
                                return urlencoding::decode(encoded).ok().map(|s| s.into_owned());
                            }
                        }
                    }
                }
                let path = parsed.path().trim_start_matches('/');
                if !path.is_empty() && (path.starts_with("http://") || path.starts_with("https://")) {
                    return Some(path.to_string());
                }
            }
        }
        if arg.starts_with("http://") || arg.starts_with("https://") {
            return Some(arg.clone());
        }
    }
    None
}

/** 向 WebView 发送 deep link / 拖放事件 */
fn emit_open_url(app: &tauri::AppHandle, url: &str) {
    let _ = app.emit("desktop-open-url", url);
    show_main_window(app);
}

/** 注册托盘图标与菜单 */
fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, MENU_SHOW, "显示主窗口", true, None::<&str>)?;
    let quick_save_item = MenuItem::with_id(app, MENU_QUICK_SAVE, "快速收藏", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, MENU_QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quick_save_item, &separator, &quit_item])?;

    let icon = app
        .default_window_icon()
        .ok_or("missing default window icon")?
        .clone();

    let app_handle = app.clone();
    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("收藏夹")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            MENU_SHOW => show_main_window(app),
            MENU_QUICK_SAVE => {
                let _ = app.emit("desktop-quick-save", ());
                show_main_window(app);
            }
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        show_main_window(app);
                    }
                }
            }
        })
        .build(app)?;

    let _ = app_handle;
    Ok(())
}

/** 注册全局快捷键：Cmd/Ctrl+Shift+S 显示窗口，Cmd/Ctrl+Shift+F 快速收藏 */
fn register_global_shortcuts(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyS);
    let quick_save_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyF);

    app.global_shortcut().on_shortcut(show_shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            show_main_window(app);
        }
    })?;

    app.global_shortcut().on_shortcut(quick_save_shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app.emit("desktop-quick-save", ());
            show_main_window(app);
        }
    })?;

    Ok(())
}

/** 关闭窗口时隐藏到托盘；拖放文件时通知前端 */
fn setup_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or("main window not found")?;

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            WindowEvent::DragDrop(drag_event) => {
                use tauri::DragDropEvent;
                if let DragDropEvent::Drop { paths, .. } = drag_event {
                    let path_strings: Vec<String> = paths
                        .iter()
                        .map(|p| p.to_string_lossy().into_owned())
                        .collect();
                    if !path_strings.is_empty() {
                        let _ = app_handle.emit("desktop-drop-files", path_strings);
                        show_main_window(&app_handle);
                    }
                }
            }
            _ => {}
        }
    });

    Ok(())
}

/** Tauri setup hook：初始化托盘、快捷键、窗口行为 */
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    setup_tray(app.handle())?;
    register_global_shortcuts(app.handle())?;
    setup_window(app.handle())?;
    Ok(())
}

/** 处理 deep link / 二次启动参数 */
pub fn handle_startup_urls(app: &tauri::AppHandle, args: Vec<String>) {
    if let Some(url) = extract_url_from_args(&args) {
        emit_open_url(app, &url);
    }
}

/** macOS：点击 Dock 图标时若窗口隐藏则重新显示 */
pub fn on_run_event(app: &tauri::AppHandle, event: &RunEvent) {
    if let RunEvent::Reopen { .. } = event {
        show_main_window(app);
    }
}
