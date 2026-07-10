import { useCallback, useEffect, useState } from "react";
import { ContinueCard } from "../../components/ContinueCard";
import { listContinueWatching, removeContinueWatching } from "../../lib/api";
import type { WatchProgress } from "../../lib/bindings/WatchProgress";
import { PosterStrip } from "./CatalogRow";
import "../library/library.css";

/** Where you left off, right on the board. Hidden while empty. */
function ContinueRow() {
	const [entries, setEntries] = useState<WatchProgress[] | null>(null);

	const refresh = useCallback(() => {
		listContinueWatching()
			.then(setEntries)
			.catch(() => setEntries([]));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	if (!entries || entries.length === 0) return null;

	return (
		<section className="catalog-row">
			<header>
				<h2>Continue watching</h2>
			</header>
			<PosterStrip>
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
			</PosterStrip>
		</section>
	);
}

export default ContinueRow;
