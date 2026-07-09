pub mod adapters;
pub mod commands;
pub mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let state =
                tauri::async_runtime::block_on(state::AppState::load_default(data_dir.clone()))?;
            app.manage(state);
            app.manage(adapters::TorrentEngine::new(data_dir.join("torrents")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::install_addon,
            commands::uninstall_addon,
            commands::list_addons,
            commands::list_catalogs,
            commands::get_catalog,
            commands::get_meta,
            commands::get_streams,
            commands::resolve_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
