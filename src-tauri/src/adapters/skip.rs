//! Where an episode's opening and ending are, when the file itself doesn't say.
//!
//! For anime the community keeps timestamps per episode, looked up by
//! MyAnimeList id. Addons hand us their own ids, so a Kitsu one is translated
//! first — and remembered, since a season's worth of episodes all resolve to
//! the same anime.

use std::collections::HashMap;
use std::time::Duration;

use reqwest::Client;
use serde_json::Value;
use tokio::sync::RwLock;
use walltch_core::skip::{
    mal_id_from_kitsu_mappings, parse_anime_id, segments_from_skip_times, AnimeSite, SkipSegment,
};

const SKIP_TIMES_URL: &str = "https://api.aniskip.com/v2/skip-times";
const KITSU_URL: &str = "https://kitsu.io/api/edge/anime";

pub struct SkipProvider {
    http: Client,
    /// Kitsu id → MyAnimeList id, for as long as the app is running.
    mal_ids: RwLock<HashMap<u32, u32>>,
}

impl SkipProvider {
    pub fn new() -> Self {
        let http = Client::builder()
            // Nothing here is worth making anyone wait: if the lookup is slow,
            // the player simply doesn't offer to skip.
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_default();
        Self {
            http,
            mal_ids: RwLock::new(HashMap::new()),
        }
    }

    /// Openings and endings for this video, or nothing at all — a missing
    /// answer is normal and never an error worth showing.
    pub async fn segments(&self, video_id: &str, duration_secs: f64) -> Vec<SkipSegment> {
        let Some(anime) = parse_anime_id(video_id) else {
            return Vec::new();
        };
        let Some(mal_id) = self.mal_id(anime.site, anime.id).await else {
            return Vec::new();
        };

        let url = format!(
            "{SKIP_TIMES_URL}/{mal_id}/{}?types=op&types=ed&types=mixed-op&types=mixed-ed&episodeLength={}",
            anime.episode,
            duration_secs.max(0.0).round()
        );
        let Ok(response) = self.http.get(url).send().await else {
            return Vec::new();
        };
        // A 404 here means "nobody has timed this episode", which is fine.
        let Ok(value) = response.json::<Value>().await else {
            return Vec::new();
        };
        segments_from_skip_times(&value)
    }

    async fn mal_id(&self, site: AnimeSite, id: u32) -> Option<u32> {
        if site == AnimeSite::MyAnimeList {
            return Some(id);
        }
        if let Some(known) = self.mal_ids.read().await.get(&id) {
            return Some(*known);
        }

        let value: Value = self
            .http
            .get(format!("{KITSU_URL}/{id}/mappings"))
            .header("accept", "application/vnd.api+json")
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;
        let mal_id = mal_id_from_kitsu_mappings(&value)?;
        self.mal_ids.write().await.insert(id, mal_id);
        Some(mal_id)
    }
}

impl Default for SkipProvider {
    fn default() -> Self {
        Self::new()
    }
}
