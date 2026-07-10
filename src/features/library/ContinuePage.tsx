import { useCallback, useEffect, useState } from "react";
import { ContinueCard } from "../../components/ContinueCard";
import { listContinueWatching, removeContinueWatching } from "../../lib/api";
import type { WatchProgress } from "../../lib/bindings/WatchProgress";
import "./library.css";

/** Everything half-watched, as its own page. */
function ContinuePage() {
	const [entries, setEntries] = useState<WatchProgress[] | null>(null);

	const refresh = useCallback(() => {
		listContinueWatching()
			.then(setEntries)
			.catch(() => setEntries([]));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return (
		<div className="page">
			<h1 className="page-title">Devam Et</h1>
			<p className="page-subtitle">Kaldığın yerden sürdür.</p>

			{entries?.length === 0 && (
				<div className="empty">
					<h2>Henüz bir şey yok</h2>
					<p>İzlemeye başladığın her şey burada seni bekler.</p>
				</div>
			)}

			{entries && entries.length > 0 && (
				<div className="continue-grid continue-page-grid">
					{entries.map((entry) => (
						<ContinueCard
							key={entry.metaId}
							entry={entry}
							onRemove={async () => {
								await removeContinueWatching(entry.metaId).catch(() => {});
								refresh();
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default ContinuePage;
