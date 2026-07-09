use serde::{Deserialize, Serialize};

use super::meta::{MetaDetail, MetaPreview};
use super::stream::Stream;
use super::subtitle::Subtitle;

/// Body of a `/catalog/{type}/{id}.json` response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogResponse {
    pub metas: Vec<MetaPreview>,
}

/// Body of a `/meta/{type}/{id}.json` response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MetaResponse {
    pub meta: MetaDetail,
}

/// Body of a `/stream/{type}/{id}.json` response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StreamsResponse {
    pub streams: Vec<Stream>,
}

/// Body of a `/subtitles/{type}/{id}.json` response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubtitlesResponse {
    pub subtitles: Vec<Subtitle>,
}
