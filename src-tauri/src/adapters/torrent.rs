use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use librqbit::http_api::{HttpApi, HttpApiOptions};
use librqbit::limits::LimitsConfig;
use librqbit::{AddTorrent, AddTorrentOptions, Api, Session, SessionOptions};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Serialize;
use tokio::sync::OnceCell;

/// What the player ends up with after a stream source is resolved.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedStream {
    /// Directly playable URL (remote for http streams, local for torrents).
    pub play_url: String,
    pub file_name: Option<String>,
}

/// Lazily started librqbit session plus its local streaming server.
/// Nothing torrent-related runs until the first torrent stream is requested.
pub struct TorrentEngine {
    download_dir: PathBuf,
    state: OnceCell<EngineState>,
}

struct EngineState {
    session: Arc<Session>,
    http_addr: SocketAddr,
}

fn build_magnet(info_hash: &str, sources: &[String]) -> String {
    let mut magnet = format!("magnet:?xt=urn:btih:{info_hash}");
    for source in sources {
        // Torrentio-style source entries: "tracker:udp://..." and "dht:<hash>".
        // DHT is already on in the session, so only trackers are useful here.
        if let Some(tracker) = source.strip_prefix("tracker:") {
            magnet.push_str("&tr=");
            magnet.push_str(&utf8_percent_encode(tracker, NON_ALPHANUMERIC).to_string());
        }
    }
    magnet
}

impl TorrentEngine {
    pub fn new(download_dir: PathBuf) -> Self {
        Self {
            download_dir,
            state: OnceCell::new(),
        }
    }

    /// Rate limits apply when the session first starts; changing them later
    /// takes effect on the next app launch.
    async fn engine(&self, ratelimits: LimitsConfig) -> anyhow::Result<&EngineState> {
        self.state
            .get_or_try_init(|| async {
                tokio::fs::create_dir_all(&self.download_dir)
                    .await
                    .context("creating download dir")?;
                let session = Session::new_with_opts(
                    self.download_dir.clone(),
                    SessionOptions {
                        ratelimits,
                        ..Default::default()
                    },
                )
                .await
                .context("starting torrent session")?;

                // librqbit ships an HTTP server whose /torrents/{hash}/stream/{idx}
                // endpoint understands Range headers — exactly what <video> needs.
                // Bind to an ephemeral localhost port and keep it read-only;
                // torrents are only ever added through the tauri commands.
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                    .await
                    .context("binding local stream server")?;
                let http_addr = listener.local_addr()?;
                let api = Api::new(session.clone(), None, None);
                let http = HttpApi::new(
                    api,
                    Some(HttpApiOptions {
                        read_only: true,
                        basic_auth: None,
                    }),
                );
                tokio::spawn(async move {
                    if let Err(e) = http.make_http_api_and_run(listener, None).await {
                        eprintln!("walltch: torrent stream server exited: {e:#}");
                    }
                });
                Ok(EngineState { session, http_addr })
            })
            .await
    }

    /// Add (or re-use) the torrent and return a local URL that streams the
    /// wanted file. When the addon didn't say which file, take the largest —
    /// that's the movie in practically every torrent.
    pub async fn stream_torrent(
        &self,
        info_hash: &str,
        file_idx: Option<u32>,
        sources: &[String],
        ratelimits: LimitsConfig,
    ) -> anyhow::Result<ResolvedStream> {
        let engine = self.engine(ratelimits).await?;
        let magnet = build_magnet(info_hash, sources);
        let opts = AddTorrentOptions {
            only_files: file_idx.map(|idx| vec![idx as usize]),
            overwrite: true,
            ..Default::default()
        };
        let handle = engine
            .session
            .add_torrent(AddTorrent::from_url(&magnet), Some(opts))
            .await
            .context("adding torrent")?
            .into_handle()
            .context("torrent came back as list-only")?;
        handle
            .wait_until_initialized()
            .await
            .context("resolving torrent metadata")?;

        let (idx, file_name) = handle.with_metadata(|metadata| {
            let idx = match file_idx {
                Some(idx) => idx as usize,
                None => metadata
                    .file_infos
                    .iter()
                    .enumerate()
                    .max_by_key(|(_, file)| file.len)
                    .map(|(i, _)| i)
                    .unwrap_or(0),
            };
            let file_name = metadata
                .file_infos
                .get(idx)
                .map(|file| file.relative_filename.to_string_lossy().into_owned());
            (idx, file_name)
        })?;

        Ok(ResolvedStream {
            play_url: format!(
                "http://127.0.0.1:{}/torrents/{}/stream/{}",
                engine.http_addr.port(),
                info_hash.to_lowercase(),
                idx
            ),
            file_name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn magnet_includes_trackers_and_skips_dht_entries() {
        let magnet = build_magnet(
            "df389295d0b130fbc38ba7c31467a5e7ff536005",
            &[
                "tracker:udp://tracker.example:1337/announce".to_owned(),
                "dht:df389295d0b130fbc38ba7c31467a5e7ff536005".to_owned(),
            ],
        );
        assert!(magnet.starts_with("magnet:?xt=urn:btih:df389295d0b130fbc38ba7c31467a5e7ff536005"));
        assert!(magnet.contains("&tr=udp%3A%2F%2Ftracker%2Eexample%3A1337%2Fannounce"));
        assert!(!magnet.contains("dht"));
    }
}
