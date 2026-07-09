use serde::{Deserialize, Serialize};

/// A subtitle track offered by an addon or attached to a stream.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Subtitle {
    #[serde(default)]
    pub id: Option<String>,
    pub url: String,
    /// ISO 639 language code, though addons don't always stick to it.
    pub lang: String,
}
