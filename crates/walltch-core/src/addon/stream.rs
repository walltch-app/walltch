use serde::{Deserialize, Serialize};

use super::subtitle::Subtitle;

/// One playable option for a video, as served by a `/stream/...` resource.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Stream {
    #[serde(flatten)]
    pub source: StreamSource,
    /// Short label, usually the addon or quality name.
    #[serde(default)]
    pub name: Option<String>,
    /// Older addons put the description in "title".
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub subtitles: Vec<Subtitle>,
    #[serde(default)]
    pub behavior_hints: StreamBehaviorHints,
}

impl Stream {
    /// Human-readable description, wherever the addon happened to put it.
    pub fn label(&self) -> Option<&str> {
        self.description.as_deref().or(self.title.as_deref())
    }
}

/// Where the stream actually comes from. Exactly one of these shapes is
/// present in the JSON; `untagged` picks the first that fits.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(untagged)]
pub enum StreamSource {
    Url {
        url: String,
    },
    #[serde(rename_all = "camelCase")]
    YouTube {
        yt_id: String,
    },
    #[serde(rename_all = "camelCase")]
    Torrent {
        info_hash: String,
        #[serde(default)]
        file_idx: Option<u32>,
        /// Extra trackers/DHT sources, e.g. "tracker:udp://..." or "dht:...".
        #[serde(default)]
        sources: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    External {
        external_url: String,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StreamBehaviorHints {
    /// True when the webview `<video>` element likely can't play this
    /// directly (codec/container not browser-friendly).
    #[serde(default)]
    pub not_web_ready: bool,
    /// Streams sharing a binge group continue with the same quality/addon
    /// when the next episode starts.
    #[serde(default)]
    pub binge_group: Option<String>,
    #[serde(default)]
    pub country_whitelist: Option<Vec<String>>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub video_size: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_url_and_torrent_streams() {
        let json = r#"[
            {"url": "https://example.com/video.mp4", "name": "HTTP 1080p"},
            {"infoHash": "df389295d0b130fbc38ba7c31467a5e7ff536005",
             "fileIdx": 2,
             "sources": ["tracker:udp://tracker.example:1337"],
             "name": "Torrentio",
             "title": "Movie.2024.1080p.WEB-DL\n👤 42 💾 2.1 GB",
             "behaviorHints": {"bingeGroup": "torrentio|1080p", "notWebReady": true}}
        ]"#;
        let streams: Vec<Stream> = serde_json::from_str(json).expect("should parse");
        assert!(matches!(&streams[0].source, StreamSource::Url { url } if url.ends_with(".mp4")));
        match &streams[1].source {
            StreamSource::Torrent {
                info_hash,
                file_idx,
                sources,
            } => {
                assert_eq!(info_hash.len(), 40);
                assert_eq!(*file_idx, Some(2));
                assert_eq!(sources.len(), 1);
            }
            other => panic!("expected torrent source, got {other:?}"),
        }
        assert!(streams[1].behavior_hints.not_web_ready);
        assert!(streams[1].label().expect("has title").contains("1080p"));
    }

    #[test]
    fn parses_youtube_and_external_streams() {
        let json = r#"[
            {"ytId": "dQw4w9WgXcQ"},
            {"externalUrl": "https://www.netflix.com/watch/80100172"}
        ]"#;
        let streams: Vec<Stream> = serde_json::from_str(json).expect("should parse");
        assert!(matches!(&streams[0].source, StreamSource::YouTube { .. }));
        assert!(matches!(&streams[1].source, StreamSource::External { .. }));
    }
}
