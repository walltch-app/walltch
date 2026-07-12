//! Profile & social identity. Domain types only — the account itself lives
//! on the server, and the desktop adapter is what talks to it. Using the app
//! means being signed in, so there is no local, profile-less mode.

pub mod friends;

pub use friends::{Friend, FriendActivity, SocialError};

use serde::{Deserialize, Serialize};

/// The signed-in user's identity, as the server holds it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// The account id (same as the auth user's).
    pub id: String,
    pub display_name: String,
    /// Short code others use to add this profile as a friend.
    pub friend_code: String,
    /// Avatar tint (hex). An uploaded image can come later.
    pub avatar_color: String,
    /// False until they've picked a name and avatar; the app shows the
    /// setup screen instead of the board while it is.
    pub onboarded: bool,
}

/// Trim a chosen display name, falling back so an avatar always has a
/// letter to show.
pub fn clean_display_name(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        "You".to_owned()
    } else {
        name.chars().take(40).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_caps_a_name() {
        assert_eq!(clean_display_name("  Can Bedir  "), "Can Bedir");
        assert_eq!(clean_display_name(&"x".repeat(60)).len(), 40);
    }

    #[test]
    fn blank_name_falls_back() {
        assert_eq!(clean_display_name("   "), "You");
    }
}
