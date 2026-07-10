//! In-memory torrent storage for the RAM cache mode: pieces live in a
//! bounded window and nothing is written to disk. librqbit ships an example
//! like this, but it doesn't compile against its own current storage trait
//! and never evicts, so this is our own take with an LRU cap.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use anyhow::Context;
use librqbit::storage::{BoxStorageFactory, StorageFactory, StorageFactoryExt, TorrentStorage};
use librqbit::{FileInfos, ManagedTorrentShared, TorrentMetadata};
use librqbit_core::lengths::{Lengths, ValidPieceIndex};

/// Cap on buffered data. Enough for smooth playback plus modest backward
/// seeks; anything further back simply re-buffers.
const MAX_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Default, Clone)]
pub struct RamStorageFactory;

impl StorageFactory for RamStorageFactory {
    type Storage = RamStorage;

    fn create(
        &self,
        _shared: &ManagedTorrentShared,
        metadata: &TorrentMetadata,
    ) -> anyhow::Result<RamStorage> {
        Ok(RamStorage::new(
            metadata.lengths,
            metadata.file_infos.clone(),
        ))
    }

    fn clone_box(&self) -> BoxStorageFactory {
        self.clone().boxed()
    }
}

struct Piece {
    last_touch: u64,
    bytes: Box<[u8]>,
}

#[derive(Default)]
struct State {
    counter: u64,
    pieces: HashMap<ValidPieceIndex, Piece>,
}

pub struct RamStorage {
    lengths: Lengths,
    file_infos: FileInfos,
    max_pieces: usize,
    state: Mutex<State>,
}

impl RamStorage {
    fn new(lengths: Lengths, file_infos: FileInfos) -> Self {
        let piece_length = lengths.default_piece_length() as u64;
        let max_pieces = (MAX_BYTES / piece_length.max(1)).max(8) as usize;
        Self {
            lengths,
            file_infos,
            max_pieces,
            state: Mutex::new(State::default()),
        }
    }

    fn locate(&self, file_id: usize, offset: u64) -> anyhow::Result<(ValidPieceIndex, usize)> {
        let file = self
            .file_infos
            .get(file_id)
            .context("file id out of range")?;
        let abs = file.offset_in_torrent + offset;
        let piece_length = self.lengths.default_piece_length() as u64;
        let index: u32 = (abs / piece_length).try_into()?;
        let piece_offset: usize = (abs % piece_length).try_into()?;
        let index = self
            .lengths
            .validate_piece_index(index)
            .context("piece index out of range")?;
        Ok((index, piece_offset))
    }

    fn piece_length(&self) -> usize {
        self.lengths.default_piece_length() as usize
    }
}

impl TorrentStorage for RamStorage {
    fn init(
        &mut self,
        _shared: &ManagedTorrentShared,
        _metadata: &TorrentMetadata,
    ) -> anyhow::Result<()> {
        Ok(())
    }

    fn pread_exact(&self, file_id: usize, offset: u64, buf: &mut [u8]) -> anyhow::Result<()> {
        let mut offset = offset;
        let mut buf = buf;
        let mut state = self.state.lock().expect("not poisoned");
        state.counter += 1;
        let touch = state.counter;
        // Reads may cross a piece boundary; walk piece by piece.
        while !buf.is_empty() {
            let (index, piece_offset) = self.locate(file_id, offset)?;
            let take = buf.len().min(self.piece_length() - piece_offset);
            let piece = state
                .pieces
                .get_mut(&index)
                .context("piece already evicted from the RAM window")?;
            piece.last_touch = touch;
            buf[..take].copy_from_slice(&piece.bytes[piece_offset..piece_offset + take]);
            offset += take as u64;
            buf = &mut buf[take..];
        }
        Ok(())
    }

    fn pwrite_all(&self, file_id: usize, offset: u64, buf: &[u8]) -> anyhow::Result<()> {
        let mut offset = offset;
        let mut buf = buf;
        let piece_length = self.piece_length();
        let mut state = self.state.lock().expect("not poisoned");
        state.counter += 1;
        let touch = state.counter;
        while !buf.is_empty() {
            let (index, piece_offset) = self.locate(file_id, offset)?;
            let take = buf.len().min(piece_length - piece_offset);
            if !state.pieces.contains_key(&index) && state.pieces.len() >= self.max_pieces {
                // Window is full: drop the piece that was touched longest ago.
                if let Some(oldest) = state
                    .pieces
                    .iter()
                    .min_by_key(|(_, p)| p.last_touch)
                    .map(|(k, _)| *k)
                {
                    state.pieces.remove(&oldest);
                }
            }
            let piece = state.pieces.entry(index).or_insert_with(|| Piece {
                last_touch: touch,
                bytes: vec![0; piece_length].into_boxed_slice(),
            });
            piece.last_touch = touch;
            piece.bytes[piece_offset..piece_offset + take].copy_from_slice(&buf[..take]);
            offset += take as u64;
            buf = &buf[take..];
        }
        Ok(())
    }

    fn remove_file(&self, _file_id: usize, _filename: &Path) -> anyhow::Result<()> {
        Ok(())
    }

    fn remove_directory_if_empty(&self, _path: &Path) -> anyhow::Result<()> {
        Ok(())
    }

    fn ensure_file_length(&self, _file_id: usize, _length: u64) -> anyhow::Result<()> {
        Ok(())
    }

    fn take(&self) -> anyhow::Result<Box<dyn TorrentStorage>> {
        let state = {
            let mut guard = self.state.lock().expect("not poisoned");
            std::mem::take(&mut *guard)
        };
        Ok(Box::new(Self {
            lengths: self.lengths,
            file_infos: self.file_infos.clone(),
            max_pieces: self.max_pieces,
            state: Mutex::new(state),
        }))
    }
}
