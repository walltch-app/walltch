use std::time::SystemTime;

/// Time source, abstracted so tests can freeze it (continue-watching
/// timestamps, cache expiry).
pub trait Clock: Send + Sync {
    fn now(&self) -> SystemTime;
}
