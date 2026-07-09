use std::path::PathBuf;

use async_trait::async_trait;
use walltch_core::ports::{Storage, StorageError};

/// Key/value storage backed by one file per key inside the app data dir.
pub struct FsStorage {
    dir: PathBuf,
}

impl FsStorage {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// Keys are simple names like "addons.json"; anything that could walk
    /// out of the storage dir is rejected.
    fn path_for(&self, key: &str) -> Result<PathBuf, StorageError> {
        let valid = !key.is_empty()
            && key
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
            && !key.split('.').all(str::is_empty)
            && key != "."
            && key != "..";
        if !valid {
            return Err(StorageError(format!("invalid storage key: {key:?}")));
        }
        Ok(self.dir.join(key))
    }
}

#[async_trait]
impl Storage for FsStorage {
    async fn read(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError> {
        let path = self.path_for(key)?;
        match tokio::fs::read(&path).await {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(StorageError(format!("read {}: {e}", path.display()))),
        }
    }

    async fn write(&self, key: &str, value: &[u8]) -> Result<(), StorageError> {
        let path = self.path_for(key)?;
        tokio::fs::create_dir_all(&self.dir)
            .await
            .map_err(|e| StorageError(format!("create {}: {e}", self.dir.display())))?;
        // Write to a sibling temp file and rename so a crash mid-write
        // can't leave a half-written library/addons file behind.
        let tmp = path.with_extension("tmp");
        tokio::fs::write(&tmp, value)
            .await
            .map_err(|e| StorageError(format!("write {}: {e}", tmp.display())))?;
        tokio::fs::rename(&tmp, &path)
            .await
            .map_err(|e| StorageError(format!("rename to {}: {e}", path.display())))
    }

    async fn delete(&self, key: &str) -> Result<(), StorageError> {
        let path = self.path_for(key)?;
        match tokio::fs::remove_file(&path).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(StorageError(format!("delete {}: {e}", path.display()))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn round_trips_values_through_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let storage = FsStorage::new(dir.path().to_path_buf());

        assert_eq!(storage.read("addons.json").await.expect("read"), None);
        storage
            .write("addons.json", b"[1,2,3]")
            .await
            .expect("write");
        assert_eq!(
            storage.read("addons.json").await.expect("read"),
            Some(b"[1,2,3]".to_vec())
        );

        storage.write("addons.json", b"[]").await.expect("rewrite");
        assert_eq!(
            storage.read("addons.json").await.expect("read"),
            Some(b"[]".to_vec())
        );

        storage.delete("addons.json").await.expect("delete");
        storage.delete("addons.json").await.expect("delete again");
        assert_eq!(storage.read("addons.json").await.expect("read"), None);
    }

    #[tokio::test]
    async fn rejects_keys_that_escape_the_dir() {
        let dir = tempfile::tempdir().expect("tempdir");
        let storage = FsStorage::new(dir.path().to_path_buf());

        for key in ["../evil", "a/b", "a\\b", "..", "", "c:evil"] {
            assert!(
                storage.read(key).await.is_err(),
                "key {key:?} should be rejected"
            );
        }
    }
}
