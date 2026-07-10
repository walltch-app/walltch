import { ChevronDown, ChevronUp, Puzzle, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	installAddon,
	listAddons,
	reorderAddons,
	uninstallAddon,
} from "../../lib/api";
import type { InstalledAddon } from "../../lib/bindings/InstalledAddon";
import type { Manifest } from "../../lib/bindings/Manifest";
import "./addons.css";

function resourceNames(manifest: Manifest): string[] {
	const names = manifest.resources.map((r) =>
		typeof r === "string" ? r : r.name,
	);
	if (manifest.catalogs.length > 0 && !names.includes("catalog")) {
		names.unshift("catalog");
	}
	return names;
}

function AddonsPage() {
	// null = still loading the list
	const [addons, setAddons] = useState<InstalledAddon[] | null>(null);
	const [url, setUrl] = useState("");
	const [installing, setInstalling] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setAddons(await listAddons());
	}, []);

	useEffect(() => {
		refresh().catch((e) => setError(String(e)));
	}, [refresh]);

	async function onInstall(event: FormEvent) {
		event.preventDefault();
		const manifestUrl = url.trim();
		if (!manifestUrl || installing) return;
		setInstalling(true);
		setError(null);
		try {
			await installAddon(manifestUrl);
			setUrl("");
			await refresh();
		} catch (e) {
			setError(String(e));
		} finally {
			setInstalling(false);
		}
	}

	async function onRemove(transportUrl: string) {
		setError(null);
		try {
			await uninstallAddon(transportUrl);
			await refresh();
		} catch (e) {
			setError(String(e));
		}
	}

	/** Order matters: metadata and streams are asked for in list order. */
	async function onMove(index: number, delta: -1 | 1) {
		if (!addons) return;
		const target = index + delta;
		if (target < 0 || target >= addons.length) return;
		const next = [...addons];
		[next[index], next[target]] = [next[target], next[index]];
		setAddons(next);
		try {
			await reorderAddons(next.map((a) => a.transportUrl));
		} catch (e) {
			setError(String(e));
			await refresh();
		}
	}

	return (
		<div className="page">
			<h1 className="page-title">Addons</h1>
			<p className="page-subtitle">
				Addons provide the catalogs, metadata and streams you see in Walltch.
			</p>

			<form className="install-form" onSubmit={onInstall}>
				<input
					type="url"
					value={url}
					onChange={(e) => setUrl(e.currentTarget.value)}
					placeholder="https://example.com/manifest.json"
					aria-label="Addon manifest URL"
					spellCheck={false}
				/>
				<button type="submit" className="btn" disabled={installing}>
					{installing ? "Installing…" : "Install"}
				</button>
			</form>
			{error && <p className="form-error">{error}</p>}

			{addons?.length === 0 && (
				<div className="empty">
					<h2>No addons installed</h2>
					<p>Paste an addon's manifest URL above to install it.</p>
				</div>
			)}

			<ul className="addon-list">
				{addons?.map((addon, index) => (
					<li key={addon.transportUrl} className="addon-card">
						{addon.manifest.logo ? (
							<img className="addon-logo" src={addon.manifest.logo} alt="" />
						) : (
							<div className="addon-logo addon-logo-fallback">
								<Puzzle aria-hidden />
							</div>
						)}
						<div className="addon-info">
							<div className="addon-heading">
								<span className="addon-name">{addon.manifest.name}</span>
								<span className="addon-version">v{addon.manifest.version}</span>
							</div>
							{addon.manifest.description && (
								<p className="addon-desc">{addon.manifest.description}</p>
							)}
							<div className="badges">
								{resourceNames(addon.manifest).map((name) => (
									<span key={name} className="badge">
										{name}
									</span>
								))}
							</div>
						</div>
						<div className="addon-actions">
							<div className="order-buttons">
								<button
									type="button"
									className="btn-order"
									onClick={() => onMove(index, -1)}
									disabled={index === 0}
									aria-label={`Move ${addon.manifest.name} up`}
								>
									<ChevronUp aria-hidden />
								</button>
								<button
									type="button"
									className="btn-order"
									onClick={() => onMove(index, 1)}
									disabled={addons !== null && index === addons.length - 1}
									aria-label={`Move ${addon.manifest.name} down`}
								>
									<ChevronDown aria-hidden />
								</button>
							</div>
							<button
								type="button"
								className="btn-remove"
								onClick={() => onRemove(addon.transportUrl)}
							>
								<Trash2 aria-hidden />
								Remove
							</button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

export default AddonsPage;
