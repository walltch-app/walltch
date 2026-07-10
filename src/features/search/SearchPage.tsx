import { SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { getCatalog, listCatalogs } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";
import { PosterCard, PosterStrip } from "../discover/CatalogRow";
import "../discover/discover.css";
import "./search.css";

type ResultRow = {
	catalog: CatalogDescriptor;
	metas: MetaPreview[];
};

function searchable(catalogs: CatalogDescriptor[]) {
	return catalogs.filter((c) => c.extra.some((e) => e.name === "search"));
}

function SearchPage() {
	const [params, setParams] = useSearchParams();
	const query = params.get("q") ?? "";
	const [input, setInput] = useState(query);
	const [rows, setRows] = useState<ResultRow[] | null>(null);
	const [searching, setSearching] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const catalogsRef = useRef<CatalogDescriptor[] | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Debounce typing into the url, which is what actually triggers a search;
	// this also makes back/forward do the right thing.
	useEffect(() => {
		const handle = setTimeout(() => {
			const trimmed = input.trim();
			if (trimmed !== query) {
				setParams(trimmed ? { q: trimmed } : {}, { replace: true });
			}
		}, 350);
		return () => clearTimeout(handle);
	}, [input, query, setParams]);

	useEffect(() => {
		if (!query) {
			setRows(null);
			return;
		}
		let stale = false;
		setSearching(true);
		(async () => {
			if (!catalogsRef.current) {
				catalogsRef.current = searchable(await listCatalogs());
			}
			const results = await Promise.all(
				catalogsRef.current.map(async (catalog) => {
					const metas = await getCatalog(
						catalog.transportUrl,
						catalog.type,
						catalog.id,
						[["search", query]],
					).catch(() => []);
					return { catalog, metas };
				}),
			);
			if (stale) return;
			setRows(results.filter((row) => row.metas.length > 0));
			setSearching(false);
		})().catch(() => {
			if (!stale) {
				setRows([]);
				setSearching(false);
			}
		});
		return () => {
			stale = true;
		};
	}, [query]);

	// One row per content type reads better than one per catalog: several
	// addons often answer with overlapping movie lists.
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
		<div className="page">
			<h1 className="page-title">Search</h1>
			<p className="page-subtitle">
				Across every addon catalog that supports it.
			</p>

			<input
				ref={inputRef}
				className="search-input"
				type="search"
				placeholder="Movies, series…"
				value={input}
				onChange={(e) => setInput(e.currentTarget.value)}
				spellCheck={false}
				aria-label="Search"
			/>

			{searching && <p className="row-note search-note">Searching…</p>}

			{!searching && query && grouped && grouped.length === 0 && (
				<div className="empty">
					<SearchX aria-hidden className="empty-icon" />
					<h2>No results for “{query}”</h2>
					<p>Try a different spelling, or install more catalog addons.</p>
				</div>
			)}

			{grouped?.map(([type, metas]) => (
				<section key={type} className="catalog-row">
					<header>
						<h2>{type}</h2>
						<span className="row-meta">{metas.length} results</span>
					</header>
					<PosterStrip>
						{metas.map((meta) => (
							<PosterCard key={`${meta.type}:${meta.id}`} meta={meta} />
						))}
					</PosterStrip>
				</section>
			))}
		</div>
	);
}

export default SearchPage;
