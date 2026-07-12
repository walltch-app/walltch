//! Tauri invoke handlers. Thin wrappers: real logic lives in AppState and
//! walltch-core; errors cross the bridge as display strings.

use std::sync::Arc;

use tauri::State;
use walltch_core::addon::{MetaDetail, MetaPreview, StreamSource};
use walltch_core::library::{LibraryItem, WatchProgress};
use walltch_core::social::{Friend, FriendActivity, Profile};

use crate::adapters::social_supabase::ActivityInput;
use crate::adapters::supabase::AuthStatus;
use crate::adapters::torrent::{DownloadEntry, EngineConfig, ResolvedStream, TorrentProgress};
use crate::adapters::{SupabaseAuth, SupabaseSocial, TorrentEngine};
use crate::state::{
    AddonStream, AddonSubtitle, AppState, CacheMode, CatalogDescriptor, InstalledAddon,
    ProfileUpdate, ProgressUpdate, Settings, StreamTier, WatchlistToggle,
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

// The profile is the account, so both of these need a session — using the
// app at all means being signed in.
#[tauri::command]
pub async fn get_profile(social: State<'_, Arc<SupabaseSocial>>) -> Result<Profile, String> {
    social.profile().await.map_err(|e| e.to_string())
}

/// Saving a profile is also what marks the setup screen as done.
#[tauri::command]
pub async fn update_profile(
    social: State<'_, Arc<SupabaseSocial>>,
    update: ProfileUpdate,
) -> Result<Profile, String> {
    social
        .update_profile(&update.display_name, &update.avatar, &update.avatar_color)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_friends(
    social: State<'_, Arc<SupabaseSocial>>,
    auth: State<'_, Arc<SupabaseAuth>>,
) -> Result<Vec<Friend>, String> {
    if !auth.is_signed_in().await {
        return Ok(Vec::new());
    }
    social.friends().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_friend(
    social: State<'_, Arc<SupabaseSocial>>,
    code: String,
) -> Result<Friend, String> {
    social.add_friend(&code).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_friend(
    social: State<'_, Arc<SupabaseSocial>>,
    id: String,
) -> Result<(), String> {
    social.remove_friend(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_friend_requests(
    social: State<'_, Arc<SupabaseSocial>>,
    auth: State<'_, Arc<SupabaseAuth>>,
) -> Result<Vec<Friend>, String> {
    if !auth.is_signed_in().await {
        return Ok(Vec::new());
    }
    social.requests().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn accept_friend(
    social: State<'_, Arc<SupabaseSocial>>,
    id: String,
) -> Result<(), String> {
    social.accept_request(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reject_friend(
    social: State<'_, Arc<SupabaseSocial>>,
    id: String,
) -> Result<(), String> {
    social.reject_request(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn friend_activity(
    social: State<'_, Arc<SupabaseSocial>>,
    auth: State<'_, Arc<SupabaseAuth>>,
) -> Result<Vec<FriendActivity>, String> {
    if !auth.is_signed_in().await {
        return Ok(Vec::new());
    }
    social.activity().await.map_err(|e| e.to_string())
}

// Signed out this is a no-op, so the player can call it unconditionally.
#[tauri::command]
pub async fn set_activity(
    social: State<'_, Arc<SupabaseSocial>>,
    auth: State<'_, Arc<SupabaseAuth>>,
    activity: ActivityInput,
) -> Result<(), String> {
    if !auth.is_signed_in().await {
        return Ok(());
    }
    social
        .set_activity(activity)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_status(auth: State<'_, Arc<SupabaseAuth>>) -> Result<AuthStatus, String> {
    Ok(auth.status().await)
}

#[tauri::command]
pub async fn sign_up(
    auth: State<'_, Arc<SupabaseAuth>>,
    email: String,
    password: String,
) -> Result<AuthStatus, String> {
    auth.sign_up(&email, &password).await
}

#[tauri::command]
pub async fn sign_in(
    auth: State<'_, Arc<SupabaseAuth>>,
    email: String,
    password: String,
) -> Result<AuthStatus, String> {
    auth.sign_in(&email, &password).await
}

#[tauri::command]
pub async fn sign_in_with_google(
    app: tauri::AppHandle,
    auth: State<'_, Arc<SupabaseAuth>>,
) -> Result<AuthStatus, String> {
    auth.sign_in_with_google(&app).await
}

#[tauri::command]
pub async fn sign_out(auth: State<'_, Arc<SupabaseAuth>>) -> Result<(), String> {
    auth.sign_out().await
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

/// How the torrent behind what's playing is doing. The player polls this
/// while it waits, so the wait can say why it's waiting.
#[tauri::command]
pub fn torrent_progress(
    engine: State<'_, TorrentEngine>,
    info_hash: String,
) -> Option<TorrentProgress> {
    engine.progress(&info_hash)
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

/// What the detail page shows: one pick per quality instead of forty rows.
#[tauri::command]
pub async fn get_stream_tiers(
    state: State<'_, AppState>,
    content_type: String,
    id: String,
) -> Result<Vec<StreamTier>, String> {
    state
        .get_stream_tiers(&content_type, &id)
        .await
        .map_err(|e| e.to_string())
}
