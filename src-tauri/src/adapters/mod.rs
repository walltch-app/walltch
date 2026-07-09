//! Desktop implementations of the walltch-core ports.

pub mod http;
pub mod storage;
pub mod torrent;

pub use http::ReqwestHttpClient;
pub use storage::FsStorage;
pub use torrent::TorrentEngine;
