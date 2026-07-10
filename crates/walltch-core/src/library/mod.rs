//! Continue-watching state. Pure logic — persistence goes through the
//! Storage port on the platform side.

use serde::{Deserialize, Serialize};

/// Watching past this fraction counts as finished.
pub const FINISHED_THRESHOLD: f64 = 0.9;

/// How far someone got into one video, plus enough display data to render
/// a continue-watching card without re-fetching meta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WatchProgress {
    /// The meta item ("tt0903747"). One entry per meta is kept.
    pub meta_id: String,
    /// The concrete video ("tt0903747:1:3"; same as meta_id for movies).
    pub video_id: String,
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub poster: Option<String>,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub updated_at_ms: u64,
}

impl WatchProgress {
    pub fn fraction(&self) -> f64 {
        if self.duration_secs <= 0.0 {
            return 0.0;
        }
        (self.position_secs / self.duration_secs).clamp(0.0, 1.0)
    }

    pub fn is_finished(&self) -> bool {
        self.fraction() >= FINISHED_THRESHOLD
    }
}

/// Most-recent-first list of things being watched, one entry per meta.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ContinueWatching {
    entries: Vec<WatchProgress>,
}

impl ContinueWatching {
    /// Keep the board a board, not an archive.
    const CAP: usize = 50;

    /// Record the latest position. Replaces any previous entry for the same
    /// meta; a finished video drops the entry entirely, so the board only
    /// ever shows things worth resuming.
    pub fn record(&mut self, progress: WatchProgress) {
        self.entries.retain(|e| e.meta_id != progress.meta_id);
        if progress.is_finished() {
            return;
        }
        self.entries.insert(0, progress);
        self.entries.truncate(Self::CAP);
    }

    pub fn remove(&mut self, meta_id: &str) {
        self.entries.retain(|e| e.meta_id != meta_id);
    }

    pub fn entries(&self) -> &[WatchProgress] {
        &self.entries
    }

    pub fn find_video(&self, video_id: &str) -> Option<&WatchProgress> {
        self.entries.iter().find(|e| e.video_id == video_id)
    }
}

/// Something the user explicitly saved to their library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub meta_id: String,
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub poster: Option<String>,
    pub added_at_ms: u64,
}

/// The saved list, newest first. Unlike continue-watching this only changes
/// when the user says so.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Watchlist {
    items: Vec<LibraryItem>,
}

impl Watchlist {
    /// Add if absent, remove if present. Returns whether the item is saved
    /// after the call.
    pub fn toggle(&mut self, item: LibraryItem) -> bool {
        if self.contains(&item.meta_id) {
            self.items.retain(|i| i.meta_id != item.meta_id);
            false
        } else {
            self.items.insert(0, item);
            true
        }
    }

    pub fn contains(&self, meta_id: &str) -> bool {
        self.items.iter().any(|i| i.meta_id == meta_id)
    }

    pub fn items(&self) -> &[LibraryItem] {
        &self.items
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn progress(meta_id: &str, video_id: &str, position: f64) -> WatchProgress {
        WatchProgress {
            meta_id: meta_id.to_owned(),
            video_id: video_id.to_owned(),
            r#type: "series".to_owned(),
            name: meta_id.to_owned(),
            poster: None,
            position_secs: position,
            duration_secs: 100.0,
            updated_at_ms: 0,
        }
    }

    #[test]
    fn newest_entry_comes_first_and_replaces_same_meta() {
        let mut cw = ContinueWatching::default();
        cw.record(progress("tt1", "tt1:1:1", 20.0));
        cw.record(progress("tt2", "tt2", 40.0));
        cw.record(progress("tt1", "tt1:1:2", 10.0));

        let ids: Vec<&str> = cw.entries().iter().map(|e| e.video_id.as_str()).collect();
        assert_eq!(ids, ["tt1:1:2", "tt2"]);
    }

    #[test]
    fn finishing_removes_the_entry() {
        let mut cw = ContinueWatching::default();
        cw.record(progress("tt1", "tt1", 20.0));
        cw.record(progress("tt1", "tt1", 95.0));
        assert!(cw.entries().is_empty());
    }

    #[test]
    fn zero_duration_never_counts_as_finished() {
        let mut entry = progress("tt1", "tt1", 0.0);
        entry.duration_secs = 0.0;
        assert!(!entry.is_finished());
        assert_eq!(entry.fraction(), 0.0);
    }

    #[test]
    fn the_board_is_capped() {
        let mut cw = ContinueWatching::default();
        for i in 0..60 {
            cw.record(progress(&format!("tt{i}"), &format!("tt{i}"), 20.0));
        }
        assert_eq!(cw.entries().len(), 50);
        // The oldest ones fell off.
        assert!(cw.entries().iter().all(|e| e.meta_id != "tt0"));
    }

    #[test]
    fn watchlist_toggles_and_keeps_newest_first() {
        let mut list = Watchlist::default();
        let item = |id: &str| LibraryItem {
            meta_id: id.to_owned(),
            r#type: "movie".to_owned(),
            name: id.to_owned(),
            poster: None,
            added_at_ms: 0,
        };

        assert!(list.toggle(item("tt1")));
        assert!(list.toggle(item("tt2")));
        assert!(list.contains("tt1"));
        let ids: Vec<&str> = list.items().iter().map(|i| i.meta_id.as_str()).collect();
        assert_eq!(ids, ["tt2", "tt1"]);

        // Toggling again removes.
        assert!(!list.toggle(item("tt1")));
        assert!(!list.contains("tt1"));
        assert_eq!(list.items().len(), 1);
    }

    #[test]
    fn find_video_matches_the_exact_episode() {
        let mut cw = ContinueWatching::default();
        cw.record(progress("tt1", "tt1:1:2", 20.0));
        assert!(cw.find_video("tt1:1:2").is_some());
        assert!(cw.find_video("tt1:1:1").is_none());
    }
}
