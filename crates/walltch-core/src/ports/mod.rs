//! Ports: the traits through which core logic reaches the outside world.
//! Each platform (desktop, later mobile) supplies its own adapters.

pub mod clock;
pub mod http;
pub mod storage;

pub use clock::Clock;
pub use http::{HttpClient, HttpError, HttpResponse};
pub use storage::{Storage, StorageError};

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use async_trait::async_trait;

    use super::*;

    // The addon client will hold ports as trait objects, so the traits must
    // stay dyn-compatible; this fails to compile if one of them regresses.
    const _: fn(&dyn HttpClient, &dyn Storage, &dyn Clock) = |_, _, _| {};

    struct MemoryStorage(Mutex<HashMap<String, Vec<u8>>>);

    #[async_trait]
    impl Storage for MemoryStorage {
        async fn read(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError> {
            Ok(self.0.lock().expect("not poisoned").get(key).cloned())
        }

        async fn write(&self, key: &str, value: &[u8]) -> Result<(), StorageError> {
            self.0
                .lock()
                .expect("not poisoned")
                .insert(key.to_owned(), value.to_vec());
            Ok(())
        }

        async fn delete(&self, key: &str) -> Result<(), StorageError> {
            self.0.lock().expect("not poisoned").remove(key);
            Ok(())
        }
    }

    #[test]
    fn storage_round_trip_through_the_trait() {
        let storage = MemoryStorage(Mutex::new(HashMap::new()));
        let storage: &dyn Storage = &storage;
        futures::executor::block_on(async {
            assert_eq!(storage.read("missing").await.expect("read"), None);
            storage.write("k", b"v").await.expect("write");
            assert_eq!(storage.read("k").await.expect("read"), Some(b"v".to_vec()));
            storage.delete("k").await.expect("delete");
            storage.delete("k").await.expect("delete twice is fine");
            assert_eq!(storage.read("k").await.expect("read"), None);
        });
    }
}
