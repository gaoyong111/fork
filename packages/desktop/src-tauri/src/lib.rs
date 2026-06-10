mod db;
mod commands;
mod desktop;

use commands::*;

/**
 * Tauri 应用入口函数
 * 初始化数据库、注册命令和插件，运行桌面应用
 */
pub fn run() {
    db::init_db(None);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            desktop::handle_startup_urls(app, argv);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            desktop::setup(app)?;
            desktop::handle_startup_urls(
                app.handle(),
                std::env::args().skip(1).collect(),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 收藏项
            collection_cmds::get_collections,
            collection_cmds::get_collection_by_id,
            collection_cmds::create_collection,
            collection_cmds::update_collection,
            collection_cmds::delete_collection,
            collection_cmds::batch_delete_collections,
            collection_cmds::batch_move_collections,
            collection_cmds::batch_add_tags,
            collection_cmds::toggle_favorite,
            collection_cmds::toggle_archive,
            collection_cmds::increment_read_count,
            collection_cmds::move_collection,
            // 文件夹
            folder_cmds::get_folder_tree,
            folder_cmds::create_folder,
            folder_cmds::update_folder,
            folder_cmds::delete_folder,
            // 标签
            tag_cmds::get_tags,
            tag_cmds::create_tag,
            tag_cmds::update_tag,
            tag_cmds::delete_tag,
            // 搜索
            search_cmds::search_collections,
            // 上传
            upload_cmds::upload_file,
            upload_cmds::upload_file_from_path,
            upload_cmds::upload_file_dialog,
            // 文件
            file_cmds::open_file,
            file_cmds::reveal_in_folder,
            // 回收站
            trash_cmds::get_trash_collections,
            trash_cmds::restore_collection,
            trash_cmds::restore_all_collections,
            trash_cmds::permanent_delete_collection,
            trash_cmds::empty_trash,
            // 元数据
            metadata_cmds::fetch_metadata,
            // AI
            ai_cmds::deep_read,
            ai_cmds::cancel_deep_read,
            // 导出
            export_cmds::export_json,
            export_cmds::export_html,
            // 导入
            import_cmds::import_json,
            import_cmds::import_html,
            // 数据管理
            data_cmds::get_storage_info,
            data_cmds::backup_database,
            data_cmds::restore_database,
            data_cmds::list_backups,
            data_cmds::delete_backup,
            data_cmds::get_data_dir,
            // 设置
            settings_cmds::get_ai_config,
            settings_cmds::set_ai_config,
            settings_cmds::test_ai_connection,
            settings_cmds::get_app_preferences,
            settings_cmds::set_app_preferences,
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .build(tauri::generate_context!())
        .expect("启动 Tauri 应用失败")
        .run(|app, event| {
            desktop::on_run_event(app, &event);
        });
}
