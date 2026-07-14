import { SearchX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCatalog, listCatalogs } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";
import {
	PosterCard,
	PosterStrip,
	RowArrows,
	type StripEdges,
	type StripHandle,
} from "../discover/CatalogRow";
import "./search.css";

type ResultRow = {
	catalog: CatalogDescriptor;
	metas: MetaPreview[];
};

function searchable(catalogs: CatalogDescriptor[]) {
	return catalogs.filter((c) => c.extra.some((e) => e.name === "search"));
}

function ResultRowSection({
	type,
	metas,
}: {
	type: string;
	metas: MetaPreview[];
}) {
	const stripRef = useRef<StripHandle>(null);
	const [edges, setEdges] = useState<StripEdges>({ left: false, right: false });

	return (
		<section className="catalog-row">
			<header>
				<h2>{type}</h2>
				<span className="row-meta">{metas.length} results</span>
				<RowArrows strip={stripRef} edges={edges} />
			</header>
			<PosterStrip ref={stripRef} onEdges={setEdges}>
				{metas.map((meta) => (
					<PosterCard key={`${meta.type}:${meta.id}`} meta={meta} />
				))}
			</PosterStrip>
		</section>
	);
}

/** Inline search results: every addon catalog that supports the search
 * extra is asked concurrently, results deduped and grouped by type. */
function SearchResults({ query }: { query: string }) {
	const [rows, setRows] = useState<ResultRow[] | null>(null);
	const [failures, setFailures] = useState<string[]>([]);
	const [searching, setSearching] = useState(false);
	const searchRef = useRef(0);

	const run = useCallback(() => {
		const generation = ++searchRef.current;
		const stale = () => generation !== searchRef.current;
		setSearching(true);
		setFailures([]);
		(async () => {
			// Re-read the catalogs each time: installing an addon between
			// searches used to leave the old list in place until a reload.
			const catalogs = searchable(await listCatalogs());
			const failed: string[] = [];
			const results = await Promise.all(
				catalogs.map(async (catalog) => {
					const metas = await getCatalog(
						catalog.transportUrl,
						catalog.type,
						catalog.id,
						[["search", query]],
					).catch(() => {
						// An addon that's down looked exactly like one with no
						// results, which is how a search can quietly lose a whole
						// content type when a second addon is installed.
						failed.push(catalog.addonName);
						return [];
					});
					return { catalog, metas };
				}),
			);
			if (stale()) return;
			setRows(results.filter((row) => row.metas.length > 0));
			setFailures([...new Set(failed)]);
			setSearching(false);
		})().catch(() => {
			if (stale()) return;
			setRows([]);
			setSearching(false);
		});
	}, [query]);

	useEffect(run, [run]);

	// One row per content type reads better than one per catalog: several
	// addons often answer with overlapping lists.
	const grouped = useMemo(() => {
		if (!rows) return null;
		const seen = new Set<string>();
		const byType = new Map<string, MetaPreview[]>();
		for (const row of rows) {
			for (const meta of row.metas) {
				const key = `${meta.type}:${meta.id}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const bucket = byType.get(meta.type) ?? [];
				bucket.push(meta);
				byType.set(meta.type, bucket);
			}
		}
		return [...byType.entries()];
	}, [rows]);

	return (
		<>
			{searching && <p className="row-note search-note">Searching…</p>}

			{!searching && failures.length > 0 && (
				<div className="search-failures">
					<TriangleAlert aria-hidden />
					<p>
						{failures.join(", ")} didn't answer, so results from{" "}
						{failures.length === 1 ? "it" : "them"} are missing.
					</p>
					<button type="button" onClick={run}>
						Retry
					</button>
				</div>
			)}

			{!searching && grouped && grouped.length === 0 && (
				<div className="empty">
					<SearchX aria-hidden className="empty-icon" />
					<h2>No results for “{query}”</h2>
					<p>Try a different spelling, or install more catalog addons.</p>
				</div>
			)}

			{grouped?.map(([type, metas]) => (
				<ResultRowSection key={type} type={type} metas={metas} />
			))}
		</>
	);
}

export default SearchResults;
