mod db;
mod commands;

use commands::*;

/**
 * Tauri 应用入口函数
 * 初始化数据库、注册命令和插件，运行桌面应用
 */
pub fn run() {
    db::init_db(None);

    tauri::Builder::default()
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
            // 回收站
            trash_cmds::get_trash_collections,
            trash_cmds::restore_collection,
            trash_cmds::restore_all_collections,
            trash_cmds::permanent_delete_collection,
            trash_cmds::empty_trash,
            // 元数据
            metadata_cmds::fetch_metadata,
            // AI
            ai_cmds::extract_summary,
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
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}