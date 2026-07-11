// Typed wrappers around the Tauri commands. The types in ./bindings are
// generated from the Rust structs by ts-rs (`cargo test` regenerates them).

import { invoke } from "@tauri-apps/api/core";
import type { AddonStream } from "./bindings/AddonStream";
import type { AddonSubtitle } from "./bindings/AddonSubtitle";
import type { CatalogDescriptor } from "./bindings/CatalogDescriptor";
import type { DownloadEntry } from "./bindings/DownloadEntry";
import type { Friend } from "./bindings/Friend";
import type { FriendActivity } from "./bindings/FriendActivity";
import type { InstalledAddon } from "./bindings/InstalledAddon";
import type { LibraryItem } from "./bindings/LibraryItem";
import type { MetaDetail } from "./bindings/MetaDetail";
import type { MetaPreview } from "./bindings/MetaPreview";
import type { Profile } from "./bindings/Profile";
import type { ProfileUpdate } from "./bindings/ProfileUpdate";
import type { ProgressUpdate } from "./bindings/ProgressUpdate";
import type { ResolvedStream } from "./bindings/ResolvedStream";
import type { Settings } from "./bindings/Settings";
import type { StreamSource } from "./bindings/StreamSource";
import type { WatchlistToggle } from "./bindings/WatchlistToggle";
import type { WatchProgress } from "./bindings/WatchProgress";

export type ExtraProps = [name: string, value: string][];

export function installAddon(url: string): Promise<InstalledAddon> {
	return invoke("install_addon", { url });
}

export function uninstallAddon(transportUrl: string): Promise<void> {
	return invoke("uninstall_addon", { transportUrl });
}

export function listAddons(): Promise<InstalledAddon[]> {
	return invoke("list_addons");
}

export function listCatalogs(): Promise<CatalogDescriptor[]> {
	return invoke("list_catalogs");
}

export function getCatalog(
	transportUrl: string,
	contentType: string,
	id: string,
	extra: ExtraProps = [],
): Promise<MetaPreview[]> {
	return invoke("get_catalog", { transportUrl, contentType, id, extra });
}

export function getMeta(contentType: string, id: string): Promise<MetaDetail> {
	return invoke("get_meta", { contentType, id });
}

export function getStreams(
	contentType: string,
	id: string,
): Promise<AddonStream[]> {
	return invoke("get_streams", { contentType, id });
}

export function getSubtitles(
	contentType: string,
	id: string,
): Promise<AddonSubtitle[]> {
	return invoke("get_subtitles", { contentType, id });
}

/** Streams carry extra display fields; the command only reads the source. */
export function resolveStream(source: StreamSource): Promise<ResolvedStream> {
	return invoke("resolve_stream", { source });
}

export function saveProgress(progress: ProgressUpdate): Promise<void> {
	return invoke("save_progress", { progress });
}

export function listContinueWatching(): Promise<WatchProgress[]> {
	return invoke("list_continue_watching");
}

export function getVideoProgress(
	videoId: string,
): Promise<WatchProgress | null> {
	return invoke("get_video_progress", { videoId });
}

export function removeContinueWatching(metaId: string): Promise<void> {
	return invoke("remove_continue_watching", { metaId });
}

/** Resolves with whether the item is saved after the toggle. */
export function toggleWatchlist(item: WatchlistToggle): Promise<boolean> {
	return invoke("toggle_watchlist", { item });
}

export function listWatchlist(): Promise<LibraryItem[]> {
	return invoke("list_watchlist");
}

export function inWatchlist(metaId: string): Promise<boolean> {
	return invoke("in_watchlist", { metaId });
}

export function getSettings(): Promise<Settings> {
	return invoke("get_settings");
}

export function setSettings(settings: Settings): Promise<void> {
	return invoke("set_settings", { settings });
}

/** Full order of transport urls; addons are resolved in this order. */
export function reorderAddons(order: string[]): Promise<void> {
	return invoke("reorder_addons", { order });
}

export function listDownloads(): Promise<DownloadEntry[]> {
	return invoke("list_downloads");
}

export function deleteDownload(name: string): Promise<void> {
	return invoke("delete_download", { name });
}

export function getProfile(): Promise<Profile> {
	return invoke("get_profile");
}

/** Resolves with the saved profile (identity fields preserved). */
export function updateProfile(update: ProfileUpdate): Promise<Profile> {
	return invoke("update_profile", { update });
}

export function listFriends(): Promise<Friend[]> {
	return invoke("list_friends");
}

/** Resolves with the added friend, or rejects with a reason string. */
export function addFriend(code: string): Promise<Friend> {
	return invoke("add_friend", { code });
}

export function removeFriend(id: string): Promise<void> {
	return invoke("remove_friend", { id });
}

export function friendActivity(): Promise<FriendActivity[]> {
	return invoke("friend_activity");
}
