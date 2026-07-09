//! Walltch core: platform-agnostic domain logic.
//!
//! No I/O lives here; the outside world is reached through port traits
//! implemented by platform adapters (desktop today, mobile later).

pub mod addon;
