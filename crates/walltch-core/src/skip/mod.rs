//! Openings and endings: where they start and stop.
//!
//! A file that carries chapters tells us itself, and that's the best source we
//! have. Everything else needs a database, and for anime one exists: the
//! community keeps opening/ending timestamps per episode, keyed on the
//! MyAnimeList id. This module holds the domain shapes and the parsing — the
//! HTTP calls live in a desktop adapter.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum SkipKind {
    Intro,
    Credits,
}

/// A stretch of an episode worth offering to skip.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SkipSegment {
    pub kind: SkipKind,
    pub start_secs: f64,
    pub end_secs: f64,
}

/// Which anime episode a video id points at. Addons write these ids in their
/// own dialect: the Kitsu-based ones as "kitsu:11469:3", others as
/// "mal:31964:3". Anything else (an IMDb id, say) isn't anime as far as the
/// timestamp database is concerned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnimeRef {
    pub site: AnimeSite,
    pub id: u32,
    pub episode: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnimeSite {
    Kitsu,
    MyAnimeList,
}

pub fn parse_anime_id(video_id: &str) -> Option<AnimeRef> {
    let mut parts = video_id.split(':');
    let site = match parts.next()? {
        "kitsu" => AnimeSite::Kitsu,
        "mal" | "myanimelist" => AnimeSite::MyAnimeList,
        _ => return None,
    };
    let id: u32 = parts.next()?.parse().ok()?;
    // A film has no episode number; the timestamp database is per episode, so
    // there's nothing to look up.
    let episode: u32 = parts.next()?.parse().ok()?;
    Some(AnimeRef { site, id, episode })
}

/// Read the skip-times payload. Segment types come through as "op"/"ed" (and
/// "mixed-op"/"mixed-ed" when the opening runs into the episode proper).
pub fn segments_from_skip_times(value: &Value) -> Vec<SkipSegment> {
    let Some(results) = value["results"].as_array() else {
        return Vec::new();
    };
    results
        .iter()
        .filter_map(|result| {
            let kind = match result["skipType"].as_str()? {
                "op" | "mixed-op" => SkipKind::Intro,
                "ed" | "mixed-ed" => SkipKind::Credits,
                _ => return None,
            };
            let start = result["interval"]["startTime"].as_f64()?;
            let end = result["interval"]["endTime"].as_f64()?;
            // Zero-length or backwards intervals are noise.
            (end - start > 3.0).then_some(SkipSegment {
                kind,
                start_secs: start,
                end_secs: end,
            })
        })
        .collect()
}

/// Pull the MyAnimeList id out of a Kitsu mappings response.
pub fn mal_id_from_kitsu_mappings(value: &Value) -> Option<u32> {
    value["data"].as_array()?.iter().find_map(|mapping| {
        let attrs = &mapping["attributes"];
        (attrs["externalSite"].as_str()? == "myanimelist/anime")
            .then(|| attrs["externalId"].as_str()?.parse().ok())
            .flatten()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_addon_anime_ids() {
        assert_eq!(
            parse_anime_id("kitsu:11469:3"),
            Some(AnimeRef {
                site: AnimeSite::Kitsu,
                id: 11469,
                episode: 3
            })
        );
        assert_eq!(
            parse_anime_id("mal:31964:1"),
            Some(AnimeRef {
                site: AnimeSite::MyAnimeList,
                id: 31964,
                episode: 1
            })
        );
        // A series from a regular addon, and an anime film: nothing to look up.
        assert_eq!(parse_anime_id("tt0903747:1:3"), None);
        assert_eq!(parse_anime_id("kitsu:11469"), None);
    }

    #[test]
    fn reads_skip_times() {
        let payload = json!({
            "found": true,
            "results": [
                {
                    "interval": { "startTime": 84.0, "endTime": 174.0 },
                    "skipType": "op",
                    "episodeLength": 1440.0
                },
                {
                    "interval": { "startTime": 1350.0, "endTime": 1430.0 },
                    "skipType": "mixed-ed",
                    "episodeLength": 1440.0
                },
                {
                    "interval": { "startTime": 10.0, "endTime": 11.0 },
                    "skipType": "recap",
                    "episodeLength": 1440.0
                }
            ]
        });
        let segments = segments_from_skip_times(&payload);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].kind, SkipKind::Intro);
        assert_eq!(segments[0].start_secs, 84.0);
        assert_eq!(segments[1].kind, SkipKind::Credits);
    }

    #[test]
    fn finds_the_mal_id_among_the_mappings() {
        let payload = json!({
            "data": [
                { "attributes": { "externalSite": "anidb", "externalId": "999" } },
                { "attributes": { "externalSite": "myanimelist/anime", "externalId": "31964" } }
            ]
        });
        assert_eq!(mal_id_from_kitsu_mappings(&payload), Some(31964));
        assert_eq!(mal_id_from_kitsu_mappings(&json!({ "data": [] })), None);
    }
}
