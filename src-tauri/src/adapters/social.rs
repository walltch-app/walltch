//! Local social backend. Persists the friends list to storage and returns
//! an empty activity feed — there's no server to pull live activity from
//! yet. When one exists, a `SupabaseSocialBackend` (or similar) implements
//! the same `SocialBackend` trait and gets managed in its place.

use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::RwLock;
use walltch_core::ports::Storage;
use walltch_core::social::{Friend, FriendActivity, FriendList, SocialBackend, SocialError};

const FRIENDS_KEY: &str = "friends.json";

pub struct LocalSocialBackend {
    storage: Arc<dyn Storage>,
    /// The local user's own code, so `add_friend` can reject adding yourself.
    own_code: String,
    friends: RwLock<FriendList>,
}

impl LocalSocialBackend {
    pub async fn load(storage: Arc<dyn Storage>, own_code: String) -> Self {
        let friends = match storage.read(FRIENDS_KEY).await.ok().flatten() {
            Some(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
            None => FriendList::default(),
        };
        Self {
            storage,
            own_code,
            friends: RwLock::new(friends),
        }
    }

    async fn persist(&self, list: &FriendList) -> Result<(), SocialError> {
        let bytes =
            serde_json::to_vec_pretty(list).map_err(|e| SocialError::Backend(e.to_string()))?;
        self.storage
            .write(FRIENDS_KEY, &bytes)
            .await
            .map_err(|e| SocialError::Backend(e.to_string()))
    }
}

#[async_trait]
impl SocialBackend for LocalSocialBackend {
    async fn friends(&self) -> Result<Vec<Friend>, SocialError> {
        Ok(self.friends.read().await.as_slice().to_vec())
    }

    async fn add_friend(&self, code: &str) -> Result<Friend, SocialError> {
        let mut list = self.friends.write().await;
        let friend = list.add(code, &self.own_code)?;
        self.persist(&list).await?;
        Ok(friend)
    }

    async fn remove_friend(&self, id: &str) -> Result<(), SocialError> {
        let mut list = self.friends.write().await;
        list.remove(id);
        self.persist(&list).await
    }

    async fn activity(&self) -> Result<Vec<FriendActivity>, SocialError> {
        Ok(Vec::new())
    }
}
