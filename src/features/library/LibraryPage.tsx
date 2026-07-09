import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { listContinueWatching, removeContinueWatching } from "../../lib/api";
import type { WatchProgress } from "../../lib/bindings/WatchProgress";
import "./library.css";

function ContinueCard({
	entry,
	onRemove,
}: {
	entry: WatchProgress;
	onRemove: () => void;
}) {
	const percent = Math.round(
		(entry.positionSecs / Math.max(entry.durationSecs, 1)) * 100,
	);
	const episode = entry.videoId.startsWith(`${entry.metaId}:`)
		? entry.videoId.slice(entry.metaId.length + 1).replace(":", "×")
		: null;

	return (
		<div className="continue-card">
			<Link
				to={`/detail/${entry.type}/${encodeURIComponent(entry.metaId)}`}
				className="continue-link"
			>
				{entry.poster ? (
					<img src={entry.poster} alt="" loading="lazy" />
				) : (
					<div className="poster-fallback" aria-hidden>
						{entry.name.slice(0, 1)}
					</div>
				)}
				<div className="continue-bar" aria-hidden>
					<div style={{ width: `${percent}%` }} />
				</div>
				<span className="poster-name">{entry.name}</span>
				<span className="poster-year">
					{episode ? `Episode ${episode} · ` : ""}
					{percent}% watched
				</span>
			</Link>
			<button
				type="button"
				className="continue-remove"
				onClick={onRemove}
				aria-label={`Remove ${entry.name} from continue watching`}
			>
				<X aria-hidden />
			</button>
		</div>
	);
}

function LibraryPage() {
	const [entries, setEntries] = useState<WatchProgress[] | null>(null);

	const refresh = useCallback(
		() =>
			listContinueWatching()
				.then(setEntries)
				.catch(() => setEntries([])),
		[],
	);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function onRemove(metaId: string) {
		await removeContinueWatching(metaId).catch(() => {});
		await refresh();
	}

	return (
		<div className="page">
			<h1 className="page-title">Library</h1>
			<p className="page-subtitle">Things you saved and where you left off.</p>

			{entries?.length === 0 && (
				<div className="empty">
					<h2>Nothing saved yet</h2>
					<p>Titles you start watching will land here automatically.</p>
				</div>
			)}

			{entries && entries.length > 0 && (
				<section className="catalog-row">
					<header>
						<h2>Continue watching</h2>
					</header>
					<div className="continue-grid">
						{entries.map((entry) => (
							<ContinueCard
								key={entry.metaId}
								entry={entry}
								onRemove={() => onRemove(entry.metaId)}
							/>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

export default LibraryPage;
