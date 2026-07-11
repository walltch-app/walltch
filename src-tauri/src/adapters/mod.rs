//! Desktop implementations of the walltch-core ports.

pub mod clock;
pub mod http;
pub mod ram_storage;
pub mod social;
pub mod storage;
pub mod supabase;
pub mod torrent;

pub use clock::SystemClock;
pub use http::ReqwestHttpClient;
pub use social::LocalSocialBackend;
pub use storage::FsStorage;
pub use supabase::SupabaseAuth;
pub use torrent::TorrentEngine;
