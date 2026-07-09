use async_trait::async_trait;
use thiserror::Error;

#[derive(Debug, Error)]
#[error("storage operation failed: {0}")]
pub struct StorageError(pub String);

/// Persistent key/value storage, implemented by the platform (files on
/// desktop). Values are opaque bytes; serialization is the caller's concern.
#[async_trait]
pub trait Storage: Send + Sync {
    /// `Ok(None)` when the key has never been written.
    async fn read(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError>;
    async fn write(&self, key: &str, value: &[u8]) -> Result<(), StorageError>;
    /// Deleting a missing key is not an error.
    async fn delete(&self, key: &str) -> Result<(), StorageError>;
}
