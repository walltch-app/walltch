use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::RwLock;
use walltch_core::addon::{
    pick, AddonClient, AddonError, ExtraProp, Manifest, MetaDetail, MetaPreview, Quality, Stream,
    StreamFacts, StreamSource, Subtitle,
};
use walltch_core::library::{ContinueWatching, LibraryItem, WatchProgress, Watchlist};
use walltch_core::ports::{Clock, HttpClient, Storage, StorageError};

use crate::adapters::{FsStorage, ReqwestHttpClient, SystemClock};

const ADDONS_KEY: &str = "addons.json";
const LIBRARY_KEY: &str = "library.json";
const WATCHLIST_KEY: &str = "watchlist.json";
const SETTINGS_KEY: &str = "settings.json";

#[derive(Debug, Error)]
pub enum AppError {
    #[error(transparent)]
    Addon(#[from] AddonError),
    #[error(transparent)]
    Storage(#[from] StorageError),
    #[error("could not serialize app data: {0}")]
    Json(#[from] serde_json::Error),
    #[error("addon already installed: {0}")]
    AlreadyInstalled(String),
    #[error("no installed addon provides {resource} for {content_type} {id}")]
    NoAddonFor {
        resource: &'static str,
        content_type: String,
        id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddon {
    pub transport_url: String,
    pub manifest: Manifest,
}

/// One catalog from one installed addon, as shown on the discover board.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CatalogDescriptor {
    pub transport_url: String,
    pub addon_name: String,
    pub r#type: String,
    pub id: String,
    pub name: Option<String>,
    pub extra: Vec<ExtraProp>,
}

/// A stream annotated with which addon offered it.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonStream {
    pub addon_name: String,
    #[serde(flatten)]
    pub stream: Stream,
}

/// What makes a stream the same stream: the file it points at.
fn stream_identity(stream: &AddonStream) -> String {
    match &stream.stream.source {
        StreamSource::Torrent {
            info_hash,
            file_idx,
            ..
        } => format!("{info_hash}:{}", file_idx.unwrap_or_default()),
        StreamSource::Url { url } => url.clone(),
        StreamSource::YouTube { yt_id } => format!("yt:{yt_id}"),
        StreamSource::External { external_url } => external_url.clone(),
    }
}

/// A stream with what we managed to read off its release name.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RankedStream {
    #[serde(flatten)]
    pub stream: AddonStream,
    pub facts: StreamFacts,
    /// Whether the player you're actually using can decode this. mpv can
    /// decode anything, so this only ever goes false on the webview.
    pub playable: bool,
}

/// One quality's worth of streams: the one we'd press play on, and the rest
/// kept behind it for anyone who wants to look.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StreamTier {
    pub quality: Quality,
    pub label: String,
    /// The tier a single press of play would open — the quality asked for in
    /// settings, or the best available when it isn't served.
    pub preferred: bool,
    pub best: RankedStream,
    pub alternatives: Vec<RankedStream>,
}

/// A subtitle annotated with which addon offered it.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonSubtitle {
    pub addon_name: String,
    #[serde(flatten)]
    pub subtitle: Subtitle,
}

/// Where torrent data lives while streaming.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum CacheMode {
    /// Downloads stay on disk; rewatching starts instantly.
    #[default]
    Keep,
    /// Downloads go to disk but are wiped when the app exits.
    Temp,
    /// Nothing touches the disk; a bounded in-memory window holds pieces.
    Ram,
}

/// User preferences. `default` on the container keeps old settings files
/// working when new fields appear.
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Accent preset id; the frontend maps it to concrete colors.
    pub accent: String,
    /// Prefer the embedded mpv over the webview <video> element.
    pub use_mpv: bool,
    /// mpv hwdec: auto-safe when on, software decoding when off.
    pub hardware_decoding: bool,
    /// mpv sub-scale multiplier.
    pub subtitle_scale: f64,
    /// Torrent download cap in MB/s; 0 means unlimited.
    pub download_limit_mbps: f64,
    /// Torrent upload cap in MB/s; 0 means unlimited.
    pub upload_limit_mbps: f64,
    /// Where stream data is cached.
    pub cache_mode: CacheMode,
    /// Two-letter code of the subtitle language to auto-select; empty = off.
    pub preferred_subtitle_lang: String,
    /// Subtitle text color as #rrggbb.
    pub subtitle_color: String,
    /// Draw a translucent box behind subtitles for readability.
    pub subtitle_background: bool,
    /// Which quality to open with. Empty means "whatever's best".
    pub preferred_quality: String,
    /// Jump the opening as soon as it starts, without asking.
    pub auto_skip_intro: bool,
}

impl Settings {
    /// The quality the user asked for, if they asked for one.
    fn quality(&self) -> Option<Quality> {
        match self.preferred_quality.as_str() {
            "uhd" => Some(Quality::Uhd),
            "fhd" => Some(Quality::Fhd),
            "hd" => Some(Quality::Hd),
            "sd" => Some(Quality::Sd),
            _ => None,
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            accent: "sunset".to_owned(),
            use_mpv: true,
            hardware_decoding: true,
            subtitle_scale: 1.0,
            download_limit_mbps: 0.0,
            upload_limit_mbps: 0.0,
            cache_mode: CacheMode::Keep,
            preferred_subtitle_lang: String::new(),
            subtitle_color: "#ffffff".to_owned(),
            subtitle_background: false,
            preferred_quality: String::new(),
            auto_skip_intro: false,
        }
    }
}

/// What the frontend knows when toggling a library item; the timestamp is
/// added here.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistToggle {
    pub meta_id: String,
    pub r#type: String,
    pub name: String,
    pub poster: Option<String>,
}

/// Fields the frontend reports while playing; the timestamp is added here.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    pub meta_id: String,
    pub video_id: String,
    pub r#type: String,
    pub name: String,
    pub poster: Option<String>,
    pub background: Option<String>,
    pub position_secs: f64,
    pub duration_secs: f64,
}

/// The editable slice of a profile; identity fields stay server/owned.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdate {
    pub display_name: String,
    pub avatar: String,
    pub avatar_color: String,
}

pub struct AppState {
    http: Arc<dyn HttpClient>,
    storage: Arc<dyn Storage>,
    clock: Arc<dyn Clock>,
    addons: RwLock<Vec<InstalledAddon>>,
    library: RwLock<ContinueWatching>,
    watchlist: RwLock<Watchlist>,
    settings: RwLock<Settings>,
}

impl AppState {
    pub async fn load_default(data_dir: PathBuf) -> Result<Self, AppError> {
        Self::load(
            Arc::new(ReqwestHttpClient::new()),
            Arc::new(FsStorage::new(data_dir)),
            Arc::new(SystemClock),
        )
        .await
    }

    async fn read_or_default<T: serde::de::DeserializeOwned + Default>(
        storage: &dyn Storage,
        key: &str,
    ) -> Result<T, AppError> {
        Ok(match storage.read(key).await? {
            Some(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|e| {
                // A corrupt state file shouldn't brick the app; start empty.
                eprintln!("walltch: ignoring corrupt {key}: {e}");
                T::default()
            }),
            None => T::default(),
        })
    }

    pub async fn load(
        http: Arc<dyn HttpClient>,
        storage: Arc<dyn Storage>,
        clock: Arc<dyn Clock>,
    ) -> Result<Self, AppError> {
        let addons: Vec<InstalledAddon> = Self::read_or_default(&*storage, ADDONS_KEY).await?;
        let library: ContinueWatching = Self::read_or_default(&*storage, LIBRARY_KEY).await?;
        let watchlist: Watchlist = Self::read_or_default(&*storage, WATCHLIST_KEY).await?;
        let settings: Settings = Self::read_or_default(&*storage, SETTINGS_KEY).await?;

        Ok(Self {
            http,
            storage,
            clock,
            addons: RwLock::new(addons),
            library: RwLock::new(library),
            watchlist: RwLock::new(watchlist),
            settings: RwLock::new(settings),
        })
    }

    pub async fn settings(&self) -> Settings {
        self.settings.read().await.clone()
    }

    pub async fn set_settings(&self, settings: Settings) -> Result<(), AppError> {
        let bytes = serde_json::to_vec_pretty(&settings)?;
        self.storage.write(SETTINGS_KEY, &bytes).await?;
        *self.settings.write().await = settings;
        Ok(())
    }

    /// Shared storage handle, so sibling adapters (e.g. the social backend)
    /// can persist alongside the app state instead of opening their own.
    pub fn storage(&self) -> Arc<dyn Storage> {
        self.storage.clone()
    }

    /// Reorder installed addons to match the given transport urls; addons
    /// not mentioned keep their relative order at the end.
    pub async fn reorder_addons(&self, order: Vec<String>) -> Result<(), AppError> {
        let mut addons = self.addons.write().await;
        let position = |a: &InstalledAddon| {
            order
                .iter()
                .position(|url| url == &a.transport_url)
                .unwrap_or(usize::MAX)
        };
        addons.sort_by_key(position);
        self.persist(&addons).await
    }

    fn now_ms(&self) -> u64 {
        self.clock
            .now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    async fn persist(&self, addons: &[InstalledAddon]) -> Result<(), AppError> {
        let bytes = serde_json::to_vec_pretty(addons)?;
        Ok(self.storage.write(ADDONS_KEY, &bytes).await?)
    }

    fn client(&self, url: &str) -> AddonClient {
        AddonClient::new(self.http.clone(), url)
    }

    pub async fn install_addon(&self, url: &str) -> Result<InstalledAddon, AppError> {
        let client = self.client(url);
        let manifest = client.fetch_manifest().await?;
        let transport_url = format!("{}/manifest.json", client.base_url());

        let mut addons = self.addons.write().await;
        if addons.iter().any(|a| a.transport_url == transport_url) {
            return Err(AppError::AlreadyInstalled(manifest.name));
        }
        let installed = InstalledAddon {
            transport_url,
            manifest,
        };
        addons.push(installed.clone());
        self.persist(&addons).await?;
        Ok(installed)
    }

    pub async fn uninstall_addon(&self, transport_url: &str) -> Result<(), AppError> {
        let mut addons = self.addons.write().await;
        addons.retain(|a| a.transport_url != transport_url);
        self.persist(&addons).await
    }

    pub async fn list_addons(&self) -> Vec<InstalledAddon> {
        self.addons.read().await.clone()
    }

    pub async fn list_catalogs(&self) -> Vec<CatalogDescriptor> {
        self.addons
            .read()
            .await
            .iter()
            .flat_map(|addon| {
                addon
                    .manifest
                    .catalogs
                    .iter()
                    .map(|catalog| CatalogDescriptor {
                        transport_url: addon.transport_url.clone(),
                        addon_name: addon.manifest.name.clone(),
                        r#type: catalog.r#type.clone(),
                        id: catalog.id.clone(),
                        name: catalog.name.clone(),
                        extra: catalog.extra.clone(),
                    })
            })
            .collect()
    }

    pub async fn get_catalog(
        &self,
        transport_url: &str,
        content_type: &str,
        id: &str,
        extra: &[(String, String)],
    ) -> Result<Vec<MetaPreview>, AppError> {
        let extra: Vec<(&str, &str)> = extra
            .iter()
            .map(|(name, value)| (name.as_str(), value.as_str()))
            .collect();
        Ok(self
            .client(transport_url)
            .catalog(content_type, id, &extra)
            .await?)
    }

    /// Ask addons that claim to serve meta for this type/id, in install
    /// order; the first one that answers wins.
    pub async fn get_meta(&self, content_type: &str, id: &str) -> Result<MetaDetail, AppError> {
        let candidates: Vec<String> = self
            .addons
            .read()
            .await
            .iter()
            .filter(|a| a.manifest.supports("meta", content_type, id))
            .map(|a| a.transport_url.clone())
            .collect();

        for transport_url in &candidates {
            if let Ok(meta) = self.client(transport_url).meta(content_type, id).await {
                return Ok(meta);
            }
        }
        Err(AppError::NoAddonFor {
            resource: "meta",
            content_type: content_type.to_owned(),
            id: id.to_owned(),
        })
    }

    /// Same fan-out as streams: every addon claiming subtitles for this
    /// type/id is asked concurrently, failures are skipped.
    pub async fn get_subtitles(
        &self,
        content_type: &str,
        id: &str,
    ) -> Result<Vec<AddonSubtitle>, AppError> {
        let candidates: Vec<(String, String)> = self
            .addons
            .read()
            .await
            .iter()
            .filter(|a| a.manifest.supports("subtitles", content_type, id))
            .map(|a| (a.manifest.name.clone(), a.transport_url.clone()))
            .collect();

        let queries = candidates.into_iter().map(|(addon_name, transport_url)| {
            let client = self.client(&transport_url);
            async move {
                let subtitles = client.subtitles(content_type, id, &[]).await.ok()?;
                Some((addon_name, subtitles))
            }
        });

        Ok(futures::future::join_all(queries)
            .await
            .into_iter()
            .flatten()
            .flat_map(|(addon_name, subtitles)| {
                subtitles.into_iter().map(move |subtitle| AddonSubtitle {
                    addon_name: addon_name.clone(),
                    subtitle,
                })
            })
            .collect())
    }

    /// Returns whether the item is in the library after the toggle.
    pub async fn toggle_watchlist(&self, toggle: WatchlistToggle) -> Result<bool, AppError> {
        let item = LibraryItem {
            meta_id: toggle.meta_id,
            r#type: toggle.r#type,
            name: toggle.name,
            poster: toggle.poster,
            added_at_ms: self.now_ms(),
        };
        let mut watchlist = self.watchlist.write().await;
        let saved = watchlist.toggle(item);
        let bytes = serde_json::to_vec_pretty(&*watchlist)?;
        self.storage.write(WATCHLIST_KEY, &bytes).await?;
        Ok(saved)
    }

    pub async fn watchlist(&self) -> Vec<LibraryItem> {
        self.watchlist.read().await.items().to_vec()
    }

    pub async fn in_watchlist(&self, meta_id: &str) -> bool {
        self.watchlist.read().await.contains(meta_id)
    }

    pub async fn save_progress(&self, update: ProgressUpdate) -> Result<(), AppError> {
        let updated_at_ms = self.now_ms();
        let progress = WatchProgress {
            meta_id: update.meta_id,
            video_id: update.video_id,
            r#type: update.r#type,
            name: update.name,
            poster: update.poster,
            background: update.background,
            position_secs: update.position_secs,
            duration_secs: update.duration_secs,
            updated_at_ms,
        };
        let mut library = self.library.write().await;
        library.record(progress);
        self.persist_library(&library).await
    }

    pub async fn continue_watching(&self) -> Vec<WatchProgress> {
        self.library.read().await.entries().to_vec()
    }

    pub async fn video_progress(&self, video_id: &str) -> Option<WatchProgress> {
        self.library.read().await.find_video(video_id).cloned()
    }

    pub async fn remove_continue_watching(&self, meta_id: &str) -> Result<(), AppError> {
        let mut library = self.library.write().await;
        library.remove(meta_id);
        self.persist_library(&library).await
    }

    async fn persist_library(&self, library: &ContinueWatching) -> Result<(), AppError> {
        let bytes = serde_json::to_vec_pretty(library)?;
        Ok(self.storage.write(LIBRARY_KEY, &bytes).await?)
    }

    /// Query every addon that serves streams for this type/id concurrently
    /// and flatten the results. Addons that error are skipped — one dead
    /// addon shouldn't hide streams from the others.
    pub async fn get_streams(
        &self,
        content_type: &str,
        id: &str,
    ) -> Result<Vec<AddonStream>, AppError> {
        let candidates: Vec<(String, String)> = self
            .addons
            .read()
            .await
            .iter()
            .filter(|a| a.manifest.supports("stream", content_type, id))
            .map(|a| (a.manifest.name.clone(), a.transport_url.clone()))
            .collect();

        let queries = candidates.into_iter().map(|(addon_name, transport_url)| {
            let client = self.client(&transport_url);
            async move {
                let streams = client.streams(content_type, id).await.ok()?;
                Some((addon_name, streams))
            }
        });

        Ok(futures::future::join_all(queries)
            .await
            .into_iter()
            .flatten()
            .flat_map(|(addon_name, streams)| {
                streams.into_iter().map(move |stream| AddonStream {
                    addon_name: addon_name.clone(),
                    stream,
                })
            })
            .collect())
    }

    /// The same streams, cut down to a choice a person can make: one pick per
    /// quality, best first, everything else tucked behind it.
    pub async fn get_stream_tiers(
        &self,
        content_type: &str,
        id: &str,
    ) -> Result<Vec<StreamTier>, AppError> {
        let settings = self.settings().await;
        // mpv decodes anything; the webview is fussy, and scoring has to know.
        let ctx = pick::PickContext {
            webview_only: !settings.use_mpv,
            preferred: settings.quality(),
        };

        let mut seen: HashSet<String> = HashSet::new();
        let mut ranked: Vec<(f32, RankedStream)> = self
            .get_streams(content_type, id)
            .await?
            .into_iter()
            // Addons repeat the same torrent under different trackers; one
            // row per file is enough.
            .filter(|stream| seen.insert(stream_identity(stream)))
            .map(|stream| {
                let facts = pick::facts(&stream.stream);
                let playable = !ctx.webview_only || facts.web_playable;
                (
                    pick::score(&facts, &ctx),
                    RankedStream {
                        stream,
                        facts,
                        playable,
                    },
                )
            })
            .collect();
        ranked.sort_by(|(a, _), (b, _)| b.total_cmp(a));

        let mut tiers: Vec<StreamTier> = Vec::new();
        for (_, ranked) in ranked {
            match tiers.iter_mut().find(|t| t.quality == ranked.facts.quality) {
                Some(tier) => tier.alternatives.push(ranked),
                None => tiers.push(StreamTier {
                    quality: ranked.facts.quality,
                    label: ranked.facts.quality.label().to_owned(),
                    preferred: false,
                    best: ranked,
                    alternatives: Vec::new(),
                }),
            }
        }
        tiers.sort_by_key(|tier| tier.quality);

        let served: Vec<Quality> = tiers.iter().map(|tier| tier.quality).collect();
        let opening = pick::preferred_quality(&served, ctx.preferred);
        for tier in &mut tiers {
            tier.preferred = Some(tier.quality) == opening;
        }
        Ok(tiers)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use async_trait::async_trait;
    use walltch_core::ports::{HttpError, HttpResponse};

    use super::*;

    struct FakeHttp(HashMap<String, (u16, String)>);

    #[async_trait]
    impl HttpClient for FakeHttp {
        async fn get(&self, url: &str) -> Result<HttpResponse, HttpError> {
            let (status, body) = self
                .0
                .get(url)
                .cloned()
                .unwrap_or((404, String::from("{}")));
            Ok(HttpResponse {
                status,
                body: body.into_bytes(),
            })
        }
    }

    #[derive(Default)]
    struct MemoryStorage(Mutex<HashMap<String, Vec<u8>>>);

    #[async_trait]
    impl Storage for MemoryStorage {
        async fn read(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError> {
            Ok(self.0.lock().expect("not poisoned").get(key).cloned())
        }
        async fn write(&self, key: &str, value: &[u8]) -> Result<(), StorageError> {
            self.0
                .lock()
                .expect("not poisoned")
                .insert(key.to_owned(), value.to_vec());
            Ok(())
        }
        async fn delete(&self, key: &str) -> Result<(), StorageError> {
            self.0.lock().expect("not poisoned").remove(key);
            Ok(())
        }
    }

    struct FixedClock;

    impl Clock for FixedClock {
        fn now(&self) -> std::time::SystemTime {
            UNIX_EPOCH + std::time::Duration::from_millis(1_700_000_000_000)
        }
    }

    const CINEMETA: &str = "https://cinemeta.example";
    const TORRENTIO: &str = "https://torrentio.example";

    fn cinemeta_manifest() -> String {
        r#"{
            "id": "org.cinemeta", "version": "1.0.0", "name": "Cinemeta",
            "types": ["movie", "series"], "idPrefixes": ["tt"],
            "resources": ["catalog", "meta"],
            "catalogs": [{"type": "movie", "id": "top", "name": "Popular"}]
        }"#
        .to_owned()
    }

    fn torrentio_manifest() -> String {
        r#"{
            "id": "org.torrentio", "version": "1.0.0", "name": "Torrentio",
            "types": ["movie", "series"], "idPrefixes": ["tt"],
            "resources": ["stream"]
        }"#
        .to_owned()
    }

    async fn state_with(responses: Vec<(String, (u16, String))>) -> AppState {
        let http = Arc::new(FakeHttp(responses.into_iter().collect()));
        let storage = Arc::new(MemoryStorage::default());
        AppState::load(http, storage, Arc::new(FixedClock))
            .await
            .expect("load")
    }

    async fn install_both(state: &AppState) {
        state
            .install_addon(&format!("{CINEMETA}/manifest.json"))
            .await
            .expect("install cinemeta");
        state
            .install_addon(&format!("{TORRENTIO}/manifest.json"))
            .await
            .expect("install torrentio");
    }

    fn manifests() -> Vec<(String, (u16, String))> {
        vec![
            (
                format!("{CINEMETA}/manifest.json"),
                (200, cinemeta_manifest()),
            ),
            (
                format!("{TORRENTIO}/manifest.json"),
                (200, torrentio_manifest()),
            ),
        ]
    }

    #[tokio::test]
    async fn install_persists_and_survives_reload() {
        let http = Arc::new(FakeHttp(manifests().into_iter().collect()));
        let storage = Arc::new(MemoryStorage::default());
        let state = AppState::load(http.clone(), storage.clone(), Arc::new(FixedClock))
            .await
            .expect("load");
        state
            .install_addon(&format!("{CINEMETA}/manifest.json"))
            .await
            .expect("install");

        // Same storage, fresh state — as if the app restarted.
        let state = AppState::load(http, storage, Arc::new(FixedClock))
            .await
            .expect("reload");
        let addons = state.list_addons().await;
        assert_eq!(addons.len(), 1);
        assert_eq!(addons[0].manifest.name, "Cinemeta");
    }

    #[tokio::test]
    async fn installing_twice_is_an_error() {
        let state = state_with(manifests()).await;
        install_both(&state).await;
        let err = state
            .install_addon(&format!("{CINEMETA}/manifest.json"))
            .await
            .expect_err("duplicate install");
        assert!(matches!(err, AppError::AlreadyInstalled(_)));
    }

    #[tokio::test]
    async fn uninstall_removes_the_addon() {
        let state = state_with(manifests()).await;
        install_both(&state).await;
        state
            .uninstall_addon(&format!("{CINEMETA}/manifest.json"))
            .await
            .expect("uninstall");
        let addons = state.list_addons().await;
        assert_eq!(addons.len(), 1);
        assert_eq!(addons[0].manifest.name, "Torrentio");
    }

    #[tokio::test]
    async fn catalogs_are_flattened_across_addons() {
        let state = state_with(manifests()).await;
        install_both(&state).await;
        let catalogs = state.list_catalogs().await;
        assert_eq!(catalogs.len(), 1);
        assert_eq!(catalogs[0].addon_name, "Cinemeta");
        assert_eq!(catalogs[0].id, "top");
    }

    #[tokio::test]
    async fn meta_comes_from_the_addon_that_supports_it() {
        let mut responses = manifests();
        responses.push((
            format!("{CINEMETA}/meta/movie/tt1.json"),
            (
                200,
                r#"{"meta": {"id": "tt1", "type": "movie", "name": "Some Movie"}}"#.to_owned(),
            ),
        ));
        let state = state_with(responses).await;
        install_both(&state).await;

        let meta = state.get_meta("movie", "tt1").await.expect("meta");
        assert_eq!(meta.name, "Some Movie");

        // Nobody serves meta for ids outside the declared prefixes.
        let err = state
            .get_meta("movie", "kitsu:1")
            .await
            .expect_err("unsupported prefix");
        assert!(matches!(err, AppError::NoAddonFor { .. }));
    }

    #[tokio::test]
    async fn settings_round_trip_and_addons_reorder() {
        let http = Arc::new(FakeHttp(manifests().into_iter().collect()));
        let storage = Arc::new(MemoryStorage::default());
        let state = AppState::load(http.clone(), storage.clone(), Arc::new(FixedClock))
            .await
            .expect("load");

        assert_eq!(state.settings().await.accent, "sunset");
        let mut settings = state.settings().await;
        settings.accent = "emerald".to_owned();
        settings.use_mpv = false;
        state.set_settings(settings).await.expect("save settings");

        install_both(&state).await;
        state
            .reorder_addons(vec![
                format!("{TORRENTIO}/manifest.json"),
                format!("{CINEMETA}/manifest.json"),
            ])
            .await
            .expect("reorder");

        // Everything comes back after a restart, in the new order.
        let state = AppState::load(http, storage, Arc::new(FixedClock))
            .await
            .expect("reload");
        assert_eq!(state.settings().await.accent, "emerald");
        assert!(!state.settings().await.use_mpv);
        let names: Vec<String> = state
            .list_addons()
            .await
            .iter()
            .map(|a| a.manifest.name.clone())
            .collect();
        assert_eq!(names, ["Torrentio", "Cinemeta"]);
    }

    #[tokio::test]
    async fn subtitles_are_collected_from_supporting_addons() {
        let mut responses = manifests();
        responses.push((
            "https://subs.example/manifest.json".to_owned(),
            (
                200,
                r#"{"id": "org.subs", "version": "1.0.0", "name": "Subs",
                    "types": ["movie", "series"], "resources": ["subtitles"]}"#
                    .to_owned(),
            ),
        ));
        responses.push((
            "https://subs.example/subtitles/movie/tt1.json".to_owned(),
            (
                200,
                r#"{"subtitles": [{"id": "1", "url": "https://subs.example/1.srt", "lang": "tur"}]}"#
                    .to_owned(),
            ),
        ));
        let state = state_with(responses).await;
        install_both(&state).await;
        state
            .install_addon("https://subs.example/manifest.json")
            .await
            .expect("install subs addon");

        let subtitles = state.get_subtitles("movie", "tt1").await.expect("subs");
        assert_eq!(subtitles.len(), 1);
        assert_eq!(subtitles[0].addon_name, "Subs");
        assert_eq!(subtitles[0].subtitle.lang, "tur");
    }

    #[tokio::test]
    async fn progress_is_stamped_and_survives_reload() {
        let http = Arc::new(FakeHttp(HashMap::new()));
        let storage = Arc::new(MemoryStorage::default());
        let state = AppState::load(http.clone(), storage.clone(), Arc::new(FixedClock))
            .await
            .expect("load");

        state
            .save_progress(ProgressUpdate {
                meta_id: "tt1".into(),
                video_id: "tt1:1:2".into(),
                r#type: "series".into(),
                name: "Some Show".into(),
                poster: None,
                background: None,
                position_secs: 421.0,
                duration_secs: 2400.0,
            })
            .await
            .expect("save");

        let state = AppState::load(http, storage, Arc::new(FixedClock))
            .await
            .expect("reload");
        let entries = state.continue_watching().await;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].updated_at_ms, 1_700_000_000_000);
        let found = state.video_progress("tt1:1:2").await.expect("progress");
        assert_eq!(found.position_secs, 421.0);

        state.remove_continue_watching("tt1").await.expect("remove");
        assert!(state.continue_watching().await.is_empty());
    }

    #[tokio::test]
    async fn streams_are_collected_and_failures_skipped() {
        let mut responses = manifests();
        // Torrentio answers; cinemeta doesn't serve streams at all.
        responses.push((
            format!("{TORRENTIO}/stream/movie/tt1.json"),
            (
                200,
                r#"{"streams": [
                    {"infoHash": "df389295d0b130fbc38ba7c31467a5e7ff536005", "name": "1080p"},
                    {"url": "https://cdn.example/tt1.mp4", "name": "HTTP"}
                ]}"#
                .to_owned(),
            ),
        ));
        let state = state_with(responses).await;
        install_both(&state).await;

        let streams = state.get_streams("movie", "tt1").await.expect("streams");
        assert_eq!(streams.len(), 2);
        assert!(streams.iter().all(|s| s.addon_name == "Torrentio"));

        // A failing addon just contributes nothing.
        let streams = state.get_streams("movie", "tt404").await.expect("streams");
        assert!(streams.is_empty());
    }
}
