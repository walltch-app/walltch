//! Desktop implementations of the walltch-core ports.

pub mod http;
pub mod storage;

pub use http::ReqwestHttpClient;
pub use storage::FsStorage;
