// Typed wrappers around the Tauri commands. The types in ./bindings are
// generated from the Rust structs by ts-rs (`cargo test` regenerates them).

import { invoke } from "@tauri-apps/api/core";
import type { AddonStream } from "./bindings/AddonStream";
import type { AddonSubtitle } from "./bindings/AddonSubtitle";
import type { CatalogDescriptor } from "./bindings/CatalogDescriptor";
import type { InstalledAddon } from "./bindings/InstalledAddon";
import type { MetaDetail } from "./bindings/MetaDetail";
import type { MetaPreview } from "./bindings/MetaPreview";
import type { ProgressUpdate } from "./bindings/ProgressUpdate";
import type { ResolvedStream } from "./bindings/ResolvedStream";
import type { StreamSource } from "./bindings/StreamSource";
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
