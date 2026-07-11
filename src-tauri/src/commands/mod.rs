//! Tauri invoke handlers. Thin wrappers: real logic lives in AppState and
//! walltch-core; errors cross the bridge as display strings.

use tauri::State;
use walltch_core::addon::{MetaDetail, MetaPreview, StreamSource};
use walltch_core::library::{LibraryItem, WatchProgress};
use walltch_core::social::Profile;

use crate::adapters::torrent::{DownloadEntry, EngineConfig, ResolvedStream};
use crate::adapters::TorrentEngine;
use crate::state::{
    AddonStream, AddonSubtitle, AppState, CacheMode, CatalogDescriptor, InstalledAddon,
    ProfileUpdate, ProgressUpdate, Settings, WatchlistToggle,
};

#[tauri::command]
pub async fn install_addon(
    state: State<'_, AppState>,
    url: String,
) -> Result<InstalledAddon, String> {
    state.install_addon(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_addon(
    state: State<'_, AppState>,
    transport_url: String,
) -> Result<(), String> {
    state
        .uninstall_addon(&transport_url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_addons(state: State<'_, AppState>) -> Result<Vec<InstalledAddon>, String> {
    Ok(state.list_addons().await)
}

#[tauri::command]
pub async fn list_catalogs(state: State<'_, AppState>) -> Result<Vec<CatalogDescriptor>, String> {
    Ok(state.list_catalogs().await)
}

#[tauri::command]
pub async fn get_catalog(
    state: State<'_, AppState>,
    transport_url: String,
    content_type: String,
    id: String,
    extra: Vec<(String, String)>,
) -> Result<Vec<MetaPreview>, String> {
    state
        .get_catalog(&transport_url, &content_type, &id, &extra)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_meta(
    state: State<'_, AppState>,
    content_type: String,
    id: String,
) -> Result<MetaDetail, String> {
    state
        .get_meta(&content_type, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings().await)
}

#[tauri::command]
pub async fn set_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    state
        .set_settings(settings)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_addons(state: State<'_, AppState>, order: Vec<String>) -> Result<(), String> {
    state.reorder_addons(order).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_profile(state: State<'_, AppState>) -> Result<Profile, String> {
    Ok(state.profile().await)
}

#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    update: ProfileUpdate,
) -> Result<Profile, String> {
    state
        .update_profile(update)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_watchlist(
    state: State<'_, AppState>,
    item: WatchlistToggle,
) -> Result<bool, String> {
    state
        .toggle_watchlist(item)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_watchlist(state: State<'_, AppState>) -> Result<Vec<LibraryItem>, String> {
    Ok(state.watchlist().await)
}

#[tauri::command]
pub async fn in_watchlist(state: State<'_, AppState>, meta_id: String) -> Result<bool, String> {
    Ok(state.in_watchlist(&meta_id).await)
}

#[tauri::command]
pub async fn get_subtitles(
    state: State<'_, AppState>,
    content_type: String,
    id: String,
) -> Result<Vec<AddonSubtitle>, String> {
    state
        .get_subtitles(&content_type, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_progress(
    state: State<'_, AppState>,
    progress: ProgressUpdate,
) -> Result<(), String> {
    state
        .save_progress(progress)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_continue_watching(
    state: State<'_, AppState>,
) -> Result<Vec<WatchProgress>, String> {
    Ok(state.continue_watching().await)
}

#[tauri::command]
pub async fn get_video_progress(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<Option<WatchProgress>, String> {
    Ok(state.video_progress(&video_id).await)
}

#[tauri::command]
pub async fn remove_continue_watching(
    state: State<'_, AppState>,
    meta_id: String,
) -> Result<(), String> {
    state
        .remove_continue_watching(&meta_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_downloads(
    engine: State<'_, TorrentEngine>,
) -> Result<Vec<DownloadEntry>, String> {
    Ok(engine.list_downloads())
}

#[tauri::command]
pub async fn delete_download(engine: State<'_, TorrentEngine>, name: String) -> Result<(), String> {
    engine.delete_download(&name).map_err(|e| e.to_string())
}

/// MB/s from settings to the bytes-per-second the torrent engine wants.
fn to_bps(mbps: f64) -> Option<std::num::NonZeroU32> {
    std::num::NonZeroU32::new((mbps.max(0.0) * 1024.0 * 1024.0) as u32)
}

/// Turn a stream source into something the player can open. Torrents spin
/// up the local streaming engine; plain URLs pass through untouched.
#[tauri::command]
pub async fn resolve_stream(
    state: State<'_, AppState>,
    engine: State<'_, TorrentEngine>,
    source: StreamSource,
) -> Result<ResolvedStream, String> {
    match source {
        StreamSource::Url { url } => Ok(ResolvedStream {
            play_url: url,
            file_name: None,
        }),
        StreamSource::Torrent {
            info_hash,
            file_idx,
            sources,
        } => {
            let settings = state.settings().await;
            let config = EngineConfig {
                ratelimits: librqbit::limits::LimitsConfig {
                    download_bps: to_bps(settings.download_limit_mbps),
                    upload_bps: to_bps(settings.upload_limit_mbps),
                },
                ram_storage: settings.cache_mode == CacheMode::Ram,
            };
            engine
                .stream_torrent(&info_hash, file_idx, &sources, config)
                .await
                .map_err(|e| format!("{e:#}"))
        }
        StreamSource::YouTube { .. } => Err("YouTube streams aren't supported yet.".to_owned()),
        StreamSource::External { .. } => {
            Err("This stream only plays on an external site.".to_owned())
        }
    }
}

#[tauri::command]
pub async fn get_streams(
    state: State<'_, AppState>,
    content_type: String,
    id: String,
) -> Result<Vec<AddonStream>, String> {
    state
        .get_streams(&content_type, &id)
        .await
        .map_err(|e| e.to_string())
}
