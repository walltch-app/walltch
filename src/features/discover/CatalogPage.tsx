import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { getCatalog } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";
import { PosterCard } from "./CatalogRow";
import "./discover.css";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

/** One catalog, all of it: infinite scroll via the skip extra, plus genre
 * chips when the catalog declares options. Opened from a row title. */
function CatalogPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const catalog = (location.state ?? null) as CatalogDescriptor | null;

	const [metas, setMetas] = useState<MetaPreview[]>([]);
	const [genre, setGenre] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const itemsRef = useRef<MetaPreview[]>([]);
	const busyRef = useRef(false);
	const doneRef = useRef(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	const supportsSkip = catalog?.extra.some((e) => e.name === "skip") ?? false;
	const genres = catalog?.extra.find((e) => e.name === "genre")?.options ?? [];

	const fetchPage = useCallback(async () => {
		if (!catalog || busyRef.current || doneRef.current) return;
		busyRef.current = true;
		setLoading(true);
		const extra: [string, string][] = [];
		if (genre) extra.push(["genre", genre]);
		if (itemsRef.current.length > 0) {
			extra.push(["skip", String(itemsRef.current.length)]);
		}
		const page = await getCatalog(
			catalog.transportUrl,
			catalog.type,
			catalog.id,
			extra,
		).catch(() => []);
		// Some addons loop content instead of ending; dedupe keeps us honest.
		const seen = new Set(itemsRef.current.map((m) => m.id));
		const fresh = page.filter((m) => !seen.has(m.id));
		if (fresh.length === 0 || !supportsSkip) doneRef.current = true;
		itemsRef.current = [...itemsRef.current, ...fresh];
		setMetas(itemsRef.current);
		setLoading(false);
		busyRef.current = false;
	}, [catalog, genre, supportsSkip]);

	// New catalog or genre: start over.
	useEffect(() => {
		itemsRef.current = [];
		doneRef.current = false;
		setMetas([]);
		fetchPage();
	}, [fetchPage]);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) fetchPage();
			},
			{ rootMargin: "700px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [fetchPage]);

	// Opened without a catalog (e.g. after a reload): nothing to show.
	useEffect(() => {
		if (!catalog) navigate("/", { replace: true });
	}, [catalog, navigate]);
	if (!catalog) return null;

	const title = catalog.name ?? catalog.type;

	return (
		<div className="page">
			<div className="catalog-head">
				<button
					type="button"
					className="back-btn"
					onClick={() => navigate(-1)}
					aria-label="Go back"
				>
					<ArrowLeft aria-hidden />
				</button>
				<h1 className="page-title catalog-title">{title}</h1>
				<span className="row-chip">{catalog.type}</span>
			</div>

			{genres.length > 0 && (
				<div className="genre-chips">
					<button
						type="button"
						className={genre === null ? "chip chip-active" : "chip"}
						onClick={() => setGenre(null)}
					>
						All
					</button>
					{genres.map((option) => (
						<button
							type="button"
							key={option}
							className={genre === option ? "chip chip-active" : "chip"}
							onClick={() => setGenre(option)}
						>
							{option}
						</button>
					))}
				</div>
			)}

			<div className="catalog-grid">
				{metas.map((meta) => (
					<PosterCard key={meta.id} meta={meta} />
				))}
				{loading &&
					SKELETON_KEYS.map((key) => (
						<div key={key} className="poster-skeleton grid-skeleton" />
					))}
			</div>

			{!loading && metas.length === 0 && (
				<div className="empty">
					<h2>Nothing here</h2>
					<p>This catalog returned no titles{genre ? ` for ${genre}` : ""}.</p>
				</div>
			)}

			<div ref={sentinelRef} aria-hidden />
		</div>
	);
}

export default CatalogPage;
