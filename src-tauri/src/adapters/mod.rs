//! Desktop implementations of the walltch-core ports.

pub mod clock;
pub mod http;
pub mod ram_storage;
pub mod storage;
pub mod torrent;

pub use clock::SystemClock;
pub use http::ReqwestHttpClient;
pub use storage::FsStorage;
pub use torrent::TorrentEngine;
