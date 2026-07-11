//! Friends and their activity feed. The `SocialBackend` trait is the whole
//! contract the UI talks to; a local implementation backs it today, a
//! hosted one (accounts + realtime) drops in behind the same trait later.

use async_trait::async_trait;
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

/// One entry in the activity feed — what a friend is watching. Empty from
/// the local backend; a server fills this in.
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

/// Everything the friends UI needs. Kept small and account-shaped: the
/// backend knows who "you" are, so nothing here passes your own identity.
#[async_trait]
pub trait SocialBackend: Send + Sync {
    async fn friends(&self) -> Result<Vec<Friend>, SocialError>;
    async fn add_friend(&self, code: &str) -> Result<Friend, SocialError>;
    async fn remove_friend(&self, id: &str) -> Result<(), SocialError>;
    async fn activity(&self) -> Result<Vec<FriendActivity>, SocialError>;
}

/// The locally-stored friends list plus its add/remove rules, split out so
/// the rules are tested without touching storage. The local backend
/// persists this; a server backend ignores it.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct FriendList {
    friends: Vec<Friend>,
}

impl FriendList {
    pub fn as_slice(&self) -> &[Friend] {
        &self.friends
    }

    /// Add a friend by code. `own_code` is checked so you can't add yourself.
    /// Until a server exists we can't resolve who a code belongs to, so the
    /// friend gets a placeholder name and a color derived from the code.
    pub fn add(&mut self, code: &str, own_code: &str) -> Result<Friend, SocialError> {
        let code = code.trim();
        if code.len() != 8 || !code.bytes().all(|b| b.is_ascii_digit()) {
            return Err(SocialError::InvalidCode);
        }
        if code == own_code {
            return Err(SocialError::SelfAdd);
        }
        if self.friends.iter().any(|f| f.friend_code == code) {
            return Err(SocialError::AlreadyAdded);
        }
        let friend = Friend {
            id: format!("local-{code}"),
            display_name: format!("Friend {}", format_code(code)),
            avatar_color: color_for(code).to_owned(),
            friend_code: code.to_owned(),
        };
        self.friends.insert(0, friend.clone());
        Ok(friend)
    }

    pub fn remove(&mut self, id: &str) {
        self.friends.retain(|f| f.id != id);
    }
}

const FRIEND_COLORS: [&str; 6] = [
    "#0353f2", "#7c5cff", "#12b886", "#f76707", "#e64980", "#22b8cf",
];

fn color_for(code: &str) -> &'static str {
    let sum: usize = code.bytes().map(usize::from).sum();
    FRIEND_COLORS[sum % FRIEND_COLORS.len()]
}

fn format_code(code: &str) -> String {
    if code.len() == 8 {
        format!("{} {}", &code[..4], &code[4..])
    } else {
        code.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_a_valid_code() {
        let mut list = FriendList::default();
        let friend = list.add("12345678", "87654321").expect("added");
        assert_eq!(friend.friend_code, "12345678");
        assert_eq!(list.as_slice().len(), 1);
    }

    #[test]
    fn rejects_bad_self_and_duplicate() {
        let mut list = FriendList::default();
        assert!(matches!(
            list.add("123", "999"),
            Err(SocialError::InvalidCode)
        ));
        assert!(matches!(
            list.add("abcdefgh", "999"),
            Err(SocialError::InvalidCode)
        ));
        assert!(matches!(
            list.add("11112222", "11112222"),
            Err(SocialError::SelfAdd)
        ));
        list.add("11112222", "999").expect("added");
        assert!(matches!(
            list.add("11112222", "999"),
            Err(SocialError::AlreadyAdded)
        ));
    }

    #[test]
    fn remove_drops_by_id() {
        let mut list = FriendList::default();
        let friend = list.add("12345678", "999").expect("added");
        list.remove(&friend.id);
        assert!(list.as_slice().is_empty());
    }
}
