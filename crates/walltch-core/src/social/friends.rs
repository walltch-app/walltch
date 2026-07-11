//! Friend types shared across the social layer. The data itself comes from
//! the server-backed adapter on the desktop side; these are just the shapes
//! that cross the Tauri bridge and the errors the UI shows.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub id: String,
    pub display_name: String,
    pub avatar_color: String,
    pub friend_code: String,
}

/// One entry in the activity feed — what a friend is watching.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FriendActivity {
    pub friend_id: String,
    pub friend_name: String,
    pub avatar_color: String,
    /// The thing being watched ("Breaking Bad").
    pub title: String,
    /// The line under it ("S1 · E3", or "Watching now").
    pub subtitle: String,
    pub poster: Option<String>,
    pub meta_id: String,
    pub content_type: String,
    pub at_ms: u64,
}

#[derive(Debug, Error)]
pub enum SocialError {
    #[error("that isn't a valid friend code")]
    InvalidCode,
    #[error("that's your own code")]
    SelfAdd,
    #[error("they're already in your friends")]
    AlreadyAdded,
    #[error("{0}")]
    Backend(String),
}
