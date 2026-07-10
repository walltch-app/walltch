import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { getSettings, setSettings } from "../../lib/api";
import type { CacheMode } from "../../lib/bindings/CacheMode";
import type { Settings } from "../../lib/bindings/Settings";
import { ACCENTS, type AccentId, applyAccent } from "../../lib/theme";
import "./settings.css";

const CACHE_MODES: {
	id: CacheMode;
	label: string;
	hint: string;
}[] = [
	{
		id: "keep",
		label: "Disk — keep downloads",
		hint: "Streams are saved and stay on disk; rewatching starts instantly, but the cache grows until you clear it.",
	},
	{
		id: "temp",
		label: "Disk — clear on exit",
		hint: "Streams buffer to disk while you watch and everything is wiped when the app closes.",
	},
	{
		id: "ram",
		label: "Memory only",
		hint: "Nothing touches the disk: a 512 MB window is held in RAM. Seeking far back re-buffers. Experimental.",
	},
];

function SettingsPage() {
	const [settings, setLocal] = useState<Settings | null>(null);

	useEffect(() => {
		getSettings()
			.then(setLocal)
			.catch(() => {});
	}, []);

	function update(next: Settings) {
		// Apply optimistically; the file write is fire-and-forget.
		setLocal(next);
		applyAccent(next.accent);
		setSettings(next).catch(() => {});
	}

	return (
		<div className="page">
			<h1 className="page-title">Settings</h1>
			<p className="page-subtitle">Appearance and playback.</p>

			{settings && (
				<>
					<section className="settings-section">
						<h2>Accent color</h2>
						<p className="settings-hint">
							Used for highlights, buttons and progress bars.
						</p>
						<div className="accent-row">
							{(Object.keys(ACCENTS) as AccentId[]).map((id) => (
								<button
									type="button"
									key={id}
									className={
										settings.accent === id
											? "accent-swatch accent-active"
											: "accent-swatch"
									}
									style={{
										background: `linear-gradient(135deg, ${ACCENTS[id].accent}, ${ACCENTS[id].accent2})`,
									}}
									onClick={() => update({ ...settings, accent: id })}
									aria-label={ACCENTS[id].name}
									title={ACCENTS[id].name}
								>
									{settings.accent === id && <Check aria-hidden />}
								</button>
							))}
						</div>
					</section>

					<section className="settings-section">
						<h2>Player</h2>
						<label className="settings-toggle">
							<input
								type="checkbox"
								checked={settings.useMpv}
								onChange={(e) =>
									update({ ...settings, useMpv: e.currentTarget.checked })
								}
							/>
							<div>
								<span>Use the embedded mpv player</span>
								<p className="settings-hint">
									Plays every format (mkv, HEVC, HDR). Turn it off to fall back
									to the basic web player if something misbehaves.
								</p>
							</div>
						</label>
						<label className="settings-toggle">
							<input
								type="checkbox"
								checked={settings.hardwareDecoding}
								onChange={(e) =>
									update({
										...settings,
										hardwareDecoding: e.currentTarget.checked,
									})
								}
							/>
							<div>
								<span>Hardware decoding</span>
								<p className="settings-hint">
									Uses your GPU to decode video. Turn it off if you see
									artifacts or crashes on older graphics drivers.
								</p>
							</div>
						</label>
					</section>

					<section className="settings-section">
						<h2>Subtitle size</h2>
						<div className="size-chips">
							{(
								[
									[0.8, "Small"],
									[1.0, "Normal"],
									[1.2, "Large"],
									[1.4, "Larger"],
								] as const
							).map(([scale, label]) => (
								<button
									type="button"
									key={scale}
									className={
										Math.abs(settings.subtitleScale - scale) < 0.01
											? "chip chip-active"
											: "chip"
									}
									onClick={() => update({ ...settings, subtitleScale: scale })}
								>
									{label}
								</button>
							))}
						</div>
					</section>

					<section className="settings-section">
						<h2>Stream storage</h2>
						<p className="settings-hint">
							Where stream data lives while you watch. Applies from the next app
							launch.
						</p>
						<div className="cache-options">
							{CACHE_MODES.map((mode) => (
								<button
									type="button"
									key={mode.id}
									className={
										settings.cacheMode === mode.id
											? "cache-option cache-active"
											: "cache-option"
									}
									onClick={() => update({ ...settings, cacheMode: mode.id })}
								>
									<span className="cache-label">
										{mode.label}
										{settings.cacheMode === mode.id && <Check aria-hidden />}
									</span>
									<span className="cache-hint">{mode.hint}</span>
								</button>
							))}
						</div>
					</section>

					<section className="settings-section">
						<h2>Streaming</h2>
						<p className="settings-hint">
							Torrent speed caps in MB/s — 0 means unlimited. Applies from the
							next app launch.
						</p>
						<div className="limit-row">
							<label>
								<span>Download limit</span>
								<input
									type="number"
									min={0}
									step={0.5}
									value={settings.downloadLimitMbps}
									onChange={(e) =>
										update({
											...settings,
											downloadLimitMbps: Math.max(
												0,
												Number(e.currentTarget.value) || 0,
											),
										})
									}
								/>
							</label>
							<label>
								<span>Upload limit</span>
								<input
									type="number"
									min={0}
									step={0.5}
									value={settings.uploadLimitMbps}
									onChange={(e) =>
										update({
											...settings,
											uploadLimitMbps: Math.max(
												0,
												Number(e.currentTarget.value) || 0,
											),
										})
									}
								/>
							</label>
						</div>
					</section>
				</>
			)}
		</div>
	);
}

export default SettingsPage;
