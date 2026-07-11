pub mod adapters;
pub mod commands;
pub mod state;

use std::sync::Arc;

use tauri::Manager;

/// In "clear on exit" cache mode the torrents dir is disposable; wipe it.
fn clear_temp_cache(app: &tauri::AppHandle) {
    let Some(app_state) = app.try_state::<state::AppState>() else {
        return;
    };
    let settings = tauri::async_runtime::block_on(app_state.settings());
    if settings.cache_mode != state::CacheMode::Temp {
        return;
    }
    if let Ok(data_dir) = app.path().app_data_dir() {
        let _ = std::fs::remove_dir_all(data_dir.join("torrents"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let state =
                tauri::async_runtime::block_on(state::AppState::load_default(data_dir.clone()))?;

            // Supabase account layer: restores any saved session on startup.
            let auth = Arc::new(tauri::async_runtime::block_on(
                adapters::SupabaseAuth::load(state.storage()),
            ));
            let social = Arc::new(adapters::SupabaseSocial::new(auth.clone()));

            app.manage(state);
            app.manage(auth);
            app.manage(social);
            app.manage(adapters::TorrentEngine::new(data_dir.join("torrents")));
            // A crash can leave temp-mode data behind; sweep it on startup too.
            clear_temp_cache(app.handle());
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
            commands::get_subtitles,
            commands::resolve_stream,
            commands::save_progress,
            commands::list_continue_watching,
            commands::get_video_progress,
            commands::remove_continue_watching,
            commands::toggle_watchlist,
            commands::list_watchlist,
            commands::in_watchlist,
            commands::get_settings,
            commands::set_settings,
            commands::reorder_addons,
            commands::list_downloads,
            commands::delete_download,
            commands::get_profile,
            commands::update_profile,
            commands::list_friends,
            commands::add_friend,
            commands::remove_friend,
            commands::friend_activity,
            commands::auth_status,
            commands::sign_up,
            commands::sign_in,
            commands::sign_out,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            clear_temp_cache(app_handle);
        }
    });
}
