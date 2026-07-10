import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { getSettings, setSettings } from "../../lib/api";
import type { Settings } from "../../lib/bindings/Settings";
import { ACCENTS, type AccentId, applyAccent } from "../../lib/theme";
import "./settings.css";

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
					</section>
				</>
			)}
		</div>
	);
}

export default SettingsPage;
