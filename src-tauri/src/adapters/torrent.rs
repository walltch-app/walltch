use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::Context;
use librqbit::http_api::{HttpApi, HttpApiOptions};
use librqbit::limits::LimitsConfig;
use librqbit::storage::StorageFactoryExt;
use librqbit::{AddTorrent, AddTorrentOptions, Api, Session, SessionOptions, TorrentStatsState};
use librqbit_core::Id20;

use super::ram_storage::RamStorageFactory;
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

/// What a torrent is doing right now, so the player can say something more
/// useful than "loading" while it waits for the first pieces.
#[derive(Debug, Clone, Default, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TorrentProgress {
    /// Still resolving the magnet — no metadata, no peers, nothing to show.
    pub initializing: bool,
    pub peers: u32,
    pub download_mbps: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// One entry in the download cache, as shown on the downloads page.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEntry {
    pub name: String,
    pub size_bytes: u64,
}

fn path_size(path: &std::path::Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    std::fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| path_size(&entry.path()))
                .sum()
        })
        .unwrap_or(0)
}

/// How the torrent session should behave; derived from user settings.
#[derive(Debug, Clone, Copy, Default)]
pub struct EngineConfig {
    pub ratelimits: LimitsConfig,
    pub ram_storage: bool,
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

/// Ports to accept incoming peers on; the usual BitTorrent range, so routers
/// and firewalls that special-case it behave.
const LISTEN_PORTS: std::ops::Range<u16> = 6881..6889;

/// How long to chase a magnet's metadata before calling it dead.
const METADATA_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);

/// Trackers every magnet gets, on top of whatever the addon supplied. Some
/// addons hand over nothing but a "dht:" entry, and bootstrapping a swarm
/// through the DHT alone is what makes a stream sit there for half a minute
/// before the first byte arrives. These are the large public ones.
const DEFAULT_TRACKERS: [&str; 8] = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.tracker.cl:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://tracker1.bt.moack.co.kr:80/announce",
];

fn build_magnet(info_hash: &str, sources: &[String]) -> String {
    let mut magnet = format!("magnet:?xt=urn:btih:{info_hash}");
    let mut trackers: Vec<&str> = sources
        .iter()
        // Torrentio-style source entries: "tracker:udp://..." and "dht:<hash>".
        // DHT is already on in the session, so only trackers are useful here.
        .filter_map(|source| source.strip_prefix("tracker:"))
        .collect();
    for tracker in DEFAULT_TRACKERS {
        if !trackers.contains(&tracker) {
            trackers.push(tracker);
        }
    }
    for tracker in trackers {
        magnet.push_str("&tr=");
        magnet.push_str(&utf8_percent_encode(tracker, NON_ALPHANUMERIC).to_string());
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

    /// What's sitting in the download cache right now.
    pub fn list_downloads(&self) -> Vec<DownloadEntry> {
        let Ok(entries) = std::fs::read_dir(&self.download_dir) else {
            return Vec::new();
        };
        let mut list: Vec<DownloadEntry> = entries
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                // Session bookkeeping files aren't downloads.
                if name.ends_with(".json") {
                    return None;
                }
                Some(DownloadEntry {
                    size_bytes: path_size(&entry.path()),
                    name,
                })
            })
            .collect();
        list.sort_by_key(|entry| std::cmp::Reverse(entry.size_bytes));
        list
    }

    /// Delete one cached download. `name` must be a plain entry name; if the
    /// torrent is still streaming, playback will fail and that's on the user.
    pub fn delete_download(&self, name: &str) -> anyhow::Result<()> {
        if name.is_empty()
            || name == "."
            || name == ".."
            || name.contains('/')
            || name.contains('\\')
        {
            anyhow::bail!("invalid download name");
        }
        let path = self.download_dir.join(name);
        if path.is_dir() {
            std::fs::remove_dir_all(&path)?;
        } else if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }

    /// Session-level knobs; they apply when the session first starts, so
    /// changing them later takes effect on the next app launch.
    async fn engine(&self, config: EngineConfig) -> anyhow::Result<&EngineState> {
        self.state
            .get_or_try_init(|| async {
                tokio::fs::create_dir_all(&self.download_dir)
                    .await
                    .context("creating download dir")?;
                let session = Session::new_with_opts(
                    self.download_dir.clone(),
                    SessionOptions {
                        ratelimits: config.ratelimits,
                        // Without a listening socket we can only ever dial out,
                        // so the swarm is whatever we manage to reach — a
                        // handful of peers and a trickle. Listening (and asking
                        // the router to forward the port) lets seeders come to
                        // us, which is most of the swarm.
                        listen_port_range: Some(LISTEN_PORTS),
                        enable_upnp_port_forwarding: true,
                        // RAM mode: pieces live in a bounded in-memory window
                        // and nothing is written to disk.
                        default_storage_factory: config
                            .ram_storage
                            .then(|| RamStorageFactory.boxed()),
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
        config: EngineConfig,
    ) -> anyhow::Result<ResolvedStream> {
        let engine = self.engine(config).await?;
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
        // A magnet with no reachable peers never resolves, and waiting on that
        // forever leaves the player on a spinner with nothing to say. Give up
        // and let the user pick another stream.
        tokio::time::timeout(METADATA_TIMEOUT, handle.wait_until_initialized())
            .await
            .map_err(|_| {
                anyhow::anyhow!("Couldn't reach anyone sharing this torrent — try another stream.")
            })?
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

    /// How the torrent behind the current stream is doing. None once the
    /// session is gone or the torrent was never added (a plain HTTP stream).
    pub fn progress(&self, info_hash: &str) -> Option<TorrentProgress> {
        let session = &self.state.get()?.session;
        let id = Id20::from_str(info_hash).ok()?;
        let handle = session.get(id.into())?;
        let stats = handle.stats();
        let live = stats.live.as_ref();
        Some(TorrentProgress {
            initializing: matches!(stats.state, TorrentStatsState::Initializing),
            peers: live
                .map(|live| live.snapshot.peer_stats.live as u32)
                .unwrap_or(0),
            download_mbps: live.map(|live| live.download_speed.mbps).unwrap_or(0.0),
            downloaded_bytes: stats.progress_bytes,
            total_bytes: stats.total_bytes,
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
