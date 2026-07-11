//! Profile & social identity. Domain types only — persistence and any
//! future social server live behind adapters. Today everything is local;
//! when a backend lands, `id` and `friend_code` become server-assigned and
//! the rest syncs, without the UI above having to change shape.

use serde::{Deserialize, Serialize};

/// The local user's identity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// Stable id. Empty until provisioned on first run; becomes the account
    /// id once a server exists.
    pub id: String,
    pub display_name: String,
    /// Short code others use to add this profile as a friend.
    pub friend_code: String,
    /// Avatar tint (hex). An uploaded image can come later.
    pub avatar_color: String,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: String::new(),
            display_name: "You".to_owned(),
            friend_code: String::new(),
            avatar_color: "#d0588a".to_owned(),
        }
    }
}

impl Profile {
    /// A profile straight from storage may predate id/code assignment.
    pub fn needs_provisioning(&self) -> bool {
        self.id.is_empty() || self.friend_code.is_empty()
    }

    /// Fold a user edit in, leaving identity fields (id, friend_code)
    /// untouched. An all-whitespace name falls back to a sensible default
    /// so an avatar always has a letter to show.
    pub fn apply_edit(&mut self, display_name: &str, avatar_color: &str) {
        let name = display_name.trim();
        self.display_name = if name.is_empty() {
            "You".to_owned()
        } else {
            name.chars().take(40).collect()
        };
        self.avatar_color = avatar_color.to_owned();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_profile_wants_provisioning() {
        assert!(Profile::default().needs_provisioning());
    }

    #[test]
    fn edit_keeps_identity_and_trims_name() {
        let mut p = Profile {
            id: "local-1".to_owned(),
            friend_code: "12345678".to_owned(),
            ..Profile::default()
        };
        p.apply_edit("  Can Bedir  ", "#0353f2");
        assert_eq!(p.display_name, "Can Bedir");
        assert_eq!(p.avatar_color, "#0353f2");
        assert_eq!(p.id, "local-1");
        assert_eq!(p.friend_code, "12345678");
    }

    #[test]
    fn blank_name_falls_back() {
        let mut p = Profile::default();
        p.apply_edit("   ", "#000000");
        assert_eq!(p.display_name, "You");
    }
}
