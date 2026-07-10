import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ContinueCard } from "../../components/ContinueCard";
import {
	listContinueWatching,
	listWatchlist,
	removeContinueWatching,
	toggleWatchlist,
} from "../../lib/api";
import type { LibraryItem } from "../../lib/bindings/LibraryItem";
import type { WatchProgress } from "../../lib/bindings/WatchProgress";
import "./library.css";

function SavedCard({
	item,
	onRemove,
}: {
	item: LibraryItem;
	onRemove: () => void;
}) {
	return (
		<div className="continue-card">
			<Link
				to={`/detail/${item.type}/${encodeURIComponent(item.metaId)}`}
				className="continue-link"
			>
				{item.poster ? (
					<img src={item.poster} alt="" loading="lazy" />
				) : (
					<div className="poster-fallback" aria-hidden>
						{item.name.slice(0, 1)}
					</div>
				)}
				<span className="poster-name">{item.name}</span>
				<span className="poster-year">{item.type}</span>
			</Link>
			<button
				type="button"
				className="continue-remove"
				onClick={onRemove}
				aria-label={`Remove ${item.name} from your library`}
			>
				<X aria-hidden />
			</button>
		</div>
	);
}

function LibraryPage() {
	const [entries, setEntries] = useState<WatchProgress[] | null>(null);
	const [saved, setSaved] = useState<LibraryItem[] | null>(null);

	const refresh = useCallback(() => {
		listContinueWatching()
			.then(setEntries)
			.catch(() => setEntries([]));
		listWatchlist()
			.then(setSaved)
			.catch(() => setSaved([]));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function onRemove(metaId: string) {
		await removeContinueWatching(metaId).catch(() => {});
		refresh();
	}

	async function onRemoveSaved(item: LibraryItem) {
		await toggleWatchlist({
			metaId: item.metaId,
			type: item.type,
			name: item.name,
			poster: item.poster,
		}).catch(() => {});
		refresh();
	}

	const isEmpty = entries?.length === 0 && saved?.length === 0;

	return (
		<div className="page">
			<h1 className="page-title">Library</h1>
			<p className="page-subtitle">Things you saved and where you left off.</p>

			{isEmpty && (
				<div className="empty">
					<h2>Nothing here yet</h2>
					<p>
						Start watching something, or add a title to your library from its
						detail page.
					</p>
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

			{saved && saved.length > 0 && (
				<section className="catalog-row">
					<header>
						<h2>Saved</h2>
					</header>
					<div className="continue-grid">
						{saved.map((item) => (
							<SavedCard
								key={item.metaId}
								item={item}
								onRemove={() => onRemoveSaved(item)}
							/>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

export default LibraryPage;
