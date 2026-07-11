import { ChevronLeft, ChevronRight } from "lucide-react";
import {
	forwardRef,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { Link, useNavigate } from "react-router";
import { getCatalog } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";

export function PosterCard({ meta }: { meta: MetaPreview }) {
	return (
		<Link
			className="poster"
			to={`/detail/${meta.type}/${encodeURIComponent(meta.id)}`}
		>
			{meta.poster ? (
				<img src={meta.poster} alt="" loading="lazy" />
			) : (
				<div className="poster-fallback" aria-hidden>
					{meta.name.slice(0, 1)}
				</div>
			)}
			<span className="poster-name">{meta.name}</span>
			{meta.releaseInfo && (
				<span className="poster-year">{meta.releaseInfo}</span>
			)}
		</Link>
	);
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export type StripHandle = {
	nudge: (direction: -1 | 1) => void;
};

export type StripEdges = { left: boolean; right: boolean };

/** Small circular arrows for a row header, wired to a PosterStrip. */
export function RowArrows({
	strip,
	edges,
}: {
	strip: RefObject<StripHandle | null>;
	edges: StripEdges;
}) {
	if (!edges.left && !edges.right) return null;
	return (
		<div className="row-actions">
			<button
				type="button"
				className="row-arrow"
				disabled={!edges.left}
				onClick={() => strip.current?.nudge(-1)}
				aria-label="Scroll left"
			>
				<ChevronLeft aria-hidden />
			</button>
			<button
				type="button"
				className="row-arrow"
				disabled={!edges.right}
				onClick={() => strip.current?.nudge(1)}
				aria-label="Scroll right"
			>
				<ChevronRight aria-hidden />
			</button>
		</div>
	);
}

export const PosterStrip = forwardRef<
	StripHandle,
	{ children: ReactNode; onEdges?: (edges: StripEdges) => void }
>(function PosterStrip({ children, onEdges }, ref) {
	const stripRef = useRef<HTMLDivElement>(null);
	const onEdgesRef = useRef(onEdges);
	onEdgesRef.current = onEdges;
	// Fade whichever edge still has content behind it, so a half-cut poster
	// melts out instead of ending on a hard vertical slice.
	const [edges, setEdges] = useState<StripEdges>({ left: false, right: false });

	const updateArrows = useCallback(() => {
		const el = stripRef.current;
		if (!el) return;
		const next = {
			left: el.scrollLeft > 4,
			right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
		};
		setEdges(next);
		onEdgesRef.current?.(next);
	}, []);

	// Content size changes (posters loading in) should re-evaluate arrows.
	useEffect(() => {
		const el = stripRef.current;
		if (!el) return;
		updateArrows();
		const observer = new ResizeObserver(updateArrows);
		observer.observe(el);
		return () => observer.disconnect();
	}, [updateArrows]);

	useImperativeHandle(
		ref,
		() => ({
			nudge: (direction: -1 | 1) => {
				const el = stripRef.current;
				el?.scrollBy({
					left: direction * el.clientWidth * 0.85,
					behavior: "smooth",
				});
			},
		}),
		[],
	);

	const fade =
		edges.left && edges.right
			? "both"
			: edges.right
				? "right"
				: edges.left
					? "left"
					: "";

	return (
		<div className="strip-wrap">
			<div
				className={fade ? `poster-strip strip-fade-${fade}` : "poster-strip"}
				ref={stripRef}
				onScroll={updateArrows}
			>
				{children}
			</div>
		</div>
	);
});

function CatalogRow({ catalog }: { catalog: CatalogDescriptor }) {
	const navigate = useNavigate();
	const [metas, setMetas] = useState<MetaPreview[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [visible, setVisible] = useState(false);
	const rowRef = useRef<HTMLElement>(null);
	const stripRef = useRef<StripHandle>(null);
	const [edges, setEdges] = useState<StripEdges>({ left: false, right: false });

	// Only hit the addon once the row is close to the viewport, so a long
	// board doesn't fire every catalog request at startup.
	useEffect(() => {
		const el = rowRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "300px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!visible) return;
		getCatalog(catalog.transportUrl, catalog.type, catalog.id)
			.then(setMetas)
			.catch(() => setFailed(true));
	}, [visible, catalog]);

	const title = catalog.name ?? catalog.type;

	return (
		<section ref={rowRef} className="catalog-row">
			<header>
				<button
					type="button"
					className="row-title-btn"
					onClick={() => navigate("/catalog", { state: catalog })}
				>
					<h2>{title}</h2>
					<ChevronRight aria-hidden />
				</button>
				<span className="row-chip">{catalog.type}</span>
				<RowArrows strip={stripRef} edges={edges} />
			</header>
			{failed ? (
				<p className="row-note">This catalog didn't answer. It may be down.</p>
			) : metas?.length === 0 ? (
				<p className="row-note">This catalog is empty right now.</p>
			) : (
				<PosterStrip ref={stripRef} onEdges={setEdges}>
					{metas
						? metas.map((meta) => <PosterCard key={meta.id} meta={meta} />)
						: SKELETON_KEYS.map((key) => (
								<div key={key} className="poster-skeleton" />
							))}
				</PosterStrip>
			)}
		</section>
	);
}

export default CatalogRow;
