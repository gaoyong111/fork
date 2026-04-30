// 防止在 Windows 上弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/**
 * Tauri 应用入口
 * 初始化并运行收藏夹桌面应用
 */

fn main() {
    // 构建 Tauri 应用
    tauri::Builder::default()
        // 注册文件系统插件（用于导入/导出功能）
        .plugin(tauri_plugin_fs::init())
        // 注册对话框插件（用于文件选择对话框）
        .plugin(tauri_plugin_dialog::init())
        // 注册 Shell 插件
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
