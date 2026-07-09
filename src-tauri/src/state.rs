use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::RwLock;
use walltch_core::addon::{
    AddonClient, AddonError, ExtraProp, Manifest, MetaDetail, MetaPreview, Stream,
};
use walltch_core::ports::{HttpClient, Storage, StorageError};

use crate::adapters::{FsStorage, ReqwestHttpClient};

const ADDONS_KEY: &str = "addons.json";

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

pub struct AppState {
    http: Arc<dyn HttpClient>,
    storage: Arc<dyn Storage>,
    addons: RwLock<Vec<InstalledAddon>>,
}

impl AppState {
    pub async fn load_default(data_dir: PathBuf) -> Result<Self, AppError> {
        Self::load(
            Arc::new(ReqwestHttpClient::new()),
            Arc::new(FsStorage::new(data_dir)),
        )
        .await
    }

    pub async fn load(
        http: Arc<dyn HttpClient>,
        storage: Arc<dyn Storage>,
    ) -> Result<Self, AppError> {
        let addons = match storage.read(ADDONS_KEY).await? {
            Some(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|e| {
                // A corrupt addons file shouldn't brick the app; start empty
                // and let the user reinstall.
                eprintln!("walltch: ignoring corrupt {ADDONS_KEY}: {e}");
                Vec::new()
            }),
            None => Vec::new(),
        };
        Ok(Self {
            http,
            storage,
            addons: RwLock::new(addons),
        })
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
        AppState::load(http, storage).await.expect("load")
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
        let state = AppState::load(http.clone(), storage.clone())
            .await
            .expect("load");
        state
            .install_addon(&format!("{CINEMETA}/manifest.json"))
            .await
            .expect("install");

        // Same storage, fresh state — as if the app restarted.
        let state = AppState::load(http, storage).await.expect("reload");
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
