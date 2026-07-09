//! Types for the Stremio addon protocol: what addons announce about
//! themselves (manifest) and what their resources return (catalog, meta,
//! stream, subtitles).
//!
//! Parsing is deliberately lenient — unknown fields are ignored and most
//! fields are optional — because community addons stray from the spec.

pub mod manifest;
pub mod meta;
pub mod response;
pub mod stream;
pub mod subtitle;

pub use manifest::{ExtraProp, Manifest, ManifestBehaviorHints, ManifestCatalog, ResourceRef};
pub use meta::{MetaBehaviorHints, MetaDetail, MetaPreview, Video};
pub use response::{CatalogResponse, MetaResponse, StreamsResponse, SubtitlesResponse};
pub use stream::{Stream, StreamBehaviorHints, StreamSource};
pub use subtitle::Subtitle;
