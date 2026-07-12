//! Reading a stream's release name, and deciding which of forty near-identical
//! torrents is the one to hand someone who just wants to press play.
//!
//! Addons don't describe streams in fields — they cram everything into the
//! title ("Movie.2026.2160p.WEB-DL.DV.HDR10+.H265", "👤 1481 💾 21.74 GB").
//! So we read the release name the way a person does, then score what we
//! found: swarm size first, but weighed against whether the file will
//! actually play and whether it's a sane size to stream.

use serde::{Deserialize, Serialize};

use super::stream::Stream;

/// The resolution tiers people actually choose between.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum Quality {
    Uhd,
    Fhd,
    Hd,
    Sd,
}

impl Quality {
    pub fn label(self) -> &'static str {
        match self {
            Quality::Uhd => "4K",
            Quality::Fhd => "1080p",
            Quality::Hd => "720p",
            Quality::Sd => "SD",
        }
    }

    /// Roughly what a good web release of this quality weighs, in bytes. Used
    /// to spot the extremes: a 40 GB remux buffers, a 900 MB "4K" is a lie.
    fn ideal_size(self) -> f64 {
        match self {
            Quality::Uhd => 12.0e9,
            Quality::Fhd => 3.0e9,
            Quality::Hd => 1.5e9,
            Quality::Sd => 0.8e9,
        }
    }
}

/// What the release name gave up.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StreamFacts {
    pub quality: Quality,
    /// HDR10, HDR10+, Dolby Vision — anything that needs a capable player.
    pub hdr: bool,
    /// HEVC/AV1 and MKV don't play in the webview yet; H.264 in MP4 does.
    pub web_playable: bool,
    pub seeders: Option<u32>,
    pub size_bytes: Option<u64>,
    /// What the release calls itself, minus the addon's own decoration.
    pub release: Option<String>,
}

/// Everything the pickers work with: a stream and what we read off it.
#[derive(Debug, Clone)]
pub struct Ranked<'a> {
    pub stream: &'a Stream,
    pub facts: StreamFacts,
    pub score: f32,
}

/// Read a stream's name, title and hints into facts.
pub fn facts(stream: &Stream) -> StreamFacts {
    let text = [
        stream.name.as_deref().unwrap_or_default(),
        stream.label().unwrap_or_default(),
        stream
            .behavior_hints
            .filename
            .as_deref()
            .unwrap_or_default(),
    ]
    .join(" ")
    .to_lowercase();

    let quality = read_quality(&text);
    let hdr = ["hdr", "dolby vision", " dv ", "dv|", "hlg"]
        .iter()
        .any(|needle| text.contains(needle));
    let heavy_codec = ["x265", "h265", "hevc", "av1", "x264 10bit", "remux"]
        .iter()
        .any(|needle| text.contains(needle));
    let mkv = text.contains("mkv");
    let web_playable = !stream.behavior_hints.not_web_ready && !heavy_codec && !mkv;

    StreamFacts {
        quality,
        hdr,
        web_playable,
        seeders: read_seeders(stream.label().unwrap_or_default()),
        size_bytes: stream
            .behavior_hints
            .video_size
            .or_else(|| read_size(stream.label().unwrap_or_default())),
        release: read_release(stream.label()),
    }
}

/// Higher is better. Swarm size leads — it's what decides whether the thing
/// starts at all — but a stream we can't play, or one so big it will stall,
/// gives most of that back.
pub fn score(facts: &StreamFacts) -> f32 {
    let mut score = ((facts.seeders.unwrap_or(0) as f32) + 1.0).log10() * 24.0;

    if !facts.web_playable {
        score -= 26.0;
    }
    if facts.hdr {
        // Tone-mapped to nothing on a webview, and often the biggest file in
        // the tier. Worth having, not worth defaulting to.
        score -= 6.0;
    }
    if let Some(size) = facts.size_bytes {
        // Distance from the tier's sweet spot, in orders of magnitude.
        let drift = (size as f64 / facts.quality.ideal_size()).log10().abs();
        score -= (drift * 14.0) as f32;
    }

    score
}

/// Rank a set of streams from best to worst within one quality tier.
pub fn rank(streams: &[Stream]) -> Vec<Ranked<'_>> {
    let mut ranked: Vec<Ranked> = streams
        .iter()
        .map(|stream| {
            let facts = facts(stream);
            let score = score(&facts);
            Ranked {
                stream,
                facts,
                score,
            }
        })
        .collect();
    ranked.sort_by(|a, b| {
        a.facts
            .quality
            .cmp(&b.facts.quality)
            .then(b.score.total_cmp(&a.score))
    });
    ranked
}

fn read_quality(text: &str) -> Quality {
    const UHD: [&str; 5] = ["2160p", "4320p", "4k", "uhd", "2160"];
    const FHD: [&str; 3] = ["1080p", "1080i", "fullhd"];
    const HD: [&str; 2] = ["720p", "720i"];

    if UHD.iter().any(|needle| text.contains(needle)) {
        Quality::Uhd
    } else if FHD.iter().any(|needle| text.contains(needle)) {
        Quality::Fhd
    } else if HD.iter().any(|needle| text.contains(needle)) {
        Quality::Hd
    } else {
        Quality::Sd
    }
}

/// Torrentio and friends write "👤 1481" for the swarm.
fn read_seeders(text: &str) -> Option<u32> {
    let after = text.split('👤').nth(1)?;
    let digits: String = after
        .trim_start()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().ok()
}

/// ...and "💾 21.74 GB" for the size.
fn read_size(text: &str) -> Option<u64> {
    let after = text.split('💾').nth(1)?.trim_start();
    let number: String = after
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let value: f64 = number.parse().ok()?;
    let rest = after[number.len()..].trim_start().to_lowercase();
    let unit = if rest.starts_with("gb") {
        1.0e9
    } else if rest.starts_with("mb") {
        1.0e6
    } else if rest.starts_with("kb") {
        1.0e3
    } else {
        return None;
    };
    Some((value * unit) as u64)
}

/// The first line of the title is the release name; the rest is the addon's
/// own stats line and flags.
fn read_release(label: Option<&str>) -> Option<String> {
    let first = label?.lines().next()?.trim();
    (!first.is_empty()).then(|| first.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::addon::stream::{StreamBehaviorHints, StreamSource};

    fn torrent(name: &str, title: &str, not_web_ready: bool) -> Stream {
        Stream {
            source: StreamSource::Torrent {
                info_hash: "df389295d0b130fbc38ba7c31467a5e7ff536005".into(),
                file_idx: None,
                sources: vec![],
            },
            name: Some(name.into()),
            title: Some(title.into()),
            description: None,
            subtitles: vec![],
            behavior_hints: StreamBehaviorHints {
                not_web_ready,
                ..Default::default()
            },
        }
    }

    #[test]
    fn reads_a_torrentio_release() {
        let stream = torrent(
            "Torrentio\n4k DV | HDR10+",
            "Obsession.2026.2160p.WEB-DL.DV.HDR10+.H265.MKV\n👤 1481 💾 21.74 GB ⚙️ ThePirateBay",
            true,
        );
        let facts = facts(&stream);
        assert_eq!(facts.quality, Quality::Uhd);
        assert!(facts.hdr);
        assert!(!facts.web_playable);
        assert_eq!(facts.seeders, Some(1481));
        assert_eq!(facts.size_bytes, Some(21_740_000_000));
        assert_eq!(
            facts.release.as_deref(),
            Some("Obsession.2026.2160p.WEB-DL.DV.HDR10+.H265.MKV")
        );
    }

    #[test]
    fn a_playable_release_beats_a_bigger_swarm_it_cannot_play() {
        let hevc = torrent(
            "Torrentio\n1080p",
            "Movie.2026.1080p.WEB-DL.x265\n👤 900 💾 3 GB",
            true,
        );
        let h264 = torrent(
            "Torrentio\n1080p",
            "Movie.2026.1080p.WEB-DL.x264.MP4\n👤 120 💾 3 GB",
            false,
        );
        assert!(score(&facts(&h264)) > score(&facts(&hevc)));
    }

    #[test]
    fn an_oversized_release_loses_to_a_sane_one() {
        let remux = torrent(
            "Torrentio\n1080p",
            "Movie.2026.1080p.BluRay.REMUX.AVC\n👤 300 💾 38 GB",
            false,
        );
        let web = torrent(
            "Torrentio\n1080p",
            "Movie.2026.1080p.WEB-DL.x264\n👤 300 💾 3 GB",
            false,
        );
        assert!(score(&facts(&web)) > score(&facts(&remux)));
    }

    #[test]
    fn ranking_groups_by_quality_then_by_score() {
        let streams = vec![
            torrent("Torrentio\n720p", "Movie.720p.x264\n👤 50 💾 1.4 GB", false),
            torrent("Torrentio\n1080p", "Movie.1080p.x264\n👤 40 💾 3 GB", false),
            torrent(
                "Torrentio\n1080p",
                "Movie.1080p.x264\n👤 800 💾 3 GB",
                false,
            ),
        ];
        let ranked = rank(&streams);
        assert_eq!(ranked[0].facts.quality, Quality::Fhd);
        assert_eq!(ranked[0].facts.seeders, Some(800));
        assert_eq!(ranked[1].facts.seeders, Some(40));
        assert_eq!(ranked[2].facts.quality, Quality::Hd);
    }
}
