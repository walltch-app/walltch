use serde::{Deserialize, Serialize};

use super::stream::Stream;

/// A lightweight meta item as returned inside catalogs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaPreview {
    pub id: String,
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub poster: Option<String>,
    /// "poster" (portrait), "landscape" or "square"; left as a string since
    /// addons in the wild put arbitrary values here.
    #[serde(default)]
    pub poster_shape: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub release_info: Option<String>,
    #[serde(default)]
    pub imdb_rating: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
}

/// The full meta object served by a `/meta/...` resource.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaDetail {
    pub id: String,
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub poster: Option<String>,
    #[serde(default)]
    pub poster_shape: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub release_info: Option<String>,
    #[serde(default)]
    pub released: Option<String>,
    #[serde(default)]
    pub runtime: Option<String>,
    #[serde(default)]
    pub imdb_rating: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub cast: Vec<String>,
    #[serde(default)]
    pub director: Vec<String>,
    #[serde(default)]
    pub writer: Vec<String>,
    #[serde(default)]
    pub website: Option<String>,
    /// Episodes/videos for series; empty for movies.
    #[serde(default)]
    pub videos: Vec<Video>,
    #[serde(default)]
    pub behavior_hints: MetaBehaviorHints,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub id: String,
    /// Cinemeta uses "name", the spec says "title" — accept both.
    #[serde(default, alias = "name")]
    pub title: Option<String>,
    #[serde(default)]
    pub released: Option<String>,
    #[serde(default)]
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub season: Option<u32>,
    #[serde(default)]
    pub episode: Option<u32>,
    #[serde(default)]
    pub overview: Option<String>,
    /// Some addons embed streams directly in the video object.
    #[serde(default)]
    pub streams: Option<Vec<Stream>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaBehaviorHints {
    #[serde(default)]
    pub default_video_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_series_meta_with_videos() {
        let json = r#"{
            "id": "tt0903747",
            "type": "series",
            "name": "Breaking Bad",
            "poster": "https://img.example/poster.jpg",
            "imdbRating": "9.5",
            "genres": ["Crime", "Drama"],
            "videos": [
                {"id": "tt0903747:1:1", "name": "Pilot", "season": 1, "episode": 1,
                 "released": "2008-01-20T00:00:00.000Z"},
                {"id": "tt0903747:1:2", "title": "Cat's in the Bag...", "season": 1, "episode": 2}
            ]
        }"#;
        let meta: MetaDetail = serde_json::from_str(json).expect("should parse");
        assert_eq!(meta.videos.len(), 2);
        assert_eq!(meta.videos[0].title.as_deref(), Some("Pilot"));
        assert_eq!(meta.videos[1].episode, Some(2));
        assert!(meta.behavior_hints.default_video_id.is_none());
    }
}
