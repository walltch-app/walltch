import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
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

export function PosterStrip({ children }: { children: React.ReactNode }) {
	const stripRef = useRef<HTMLDivElement>(null);
	const [canLeft, setCanLeft] = useState(false);
	const [canRight, setCanRight] = useState(false);

	const updateArrows = useCallback(() => {
		const el = stripRef.current;
		if (!el) return;
		setCanLeft(el.scrollLeft > 4);
		setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
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

	// Vertical wheel scrolls the strip horizontally while it has room; once
	// the strip is at its end the page scrolls normally again. Wheel ticks
	// move a target and an rAF loop eases toward it, because stepping
	// scrollLeft directly feels like a ratchet.
	useEffect(() => {
		const el = stripRef.current;
		if (!el) return;
		let target = el.scrollLeft;
		let frame = 0;

		const settle = () => {
			const diff = target - el.scrollLeft;
			if (Math.abs(diff) < 0.6) {
				el.scrollLeft = target;
				frame = 0;
				return;
			}
			el.scrollLeft += diff * 0.16;
			frame = requestAnimationFrame(settle);
		};

		const onWheel = (event: WheelEvent) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			const max = el.scrollWidth - el.clientWidth;
			if (max <= 0) return;
			const atStart = el.scrollLeft <= 0 && event.deltaY < 0;
			const atEnd = el.scrollLeft >= max - 1 && event.deltaY > 0;
			if (atStart || atEnd) {
				target = el.scrollLeft;
				return;
			}
			event.preventDefault();
			const from = frame ? target : el.scrollLeft;
			target = Math.max(0, Math.min(max, from + event.deltaY * 2.2));
			if (!frame) frame = requestAnimationFrame(settle);
		};

		el.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			el.removeEventListener("wheel", onWheel);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);

	const nudge = (direction: -1 | 1) => {
		const el = stripRef.current;
		el?.scrollBy({
			left: direction * el.clientWidth * 0.85,
			behavior: "smooth",
		});
	};

	return (
		<div className="strip-wrap">
			<div className="poster-strip" ref={stripRef} onScroll={updateArrows}>
				{children}
			</div>
			{canLeft && (
				<button
					type="button"
					className="strip-nav strip-nav-left"
					onClick={() => nudge(-1)}
					aria-label="Scroll left"
				>
					<ChevronLeft aria-hidden />
				</button>
			)}
			{canRight && (
				<button
					type="button"
					className="strip-nav strip-nav-right"
					onClick={() => nudge(1)}
					aria-label="Scroll right"
				>
					<ChevronRight aria-hidden />
				</button>
			)}
		</div>
	);
}

function CatalogRow({ catalog }: { catalog: CatalogDescriptor }) {
	const [metas, setMetas] = useState<MetaPreview[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [visible, setVisible] = useState(false);
	const rowRef = useRef<HTMLElement>(null);

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
				<h2>{title}</h2>
				<span className="row-chip">{catalog.type}</span>
			</header>
			{failed ? (
				<p className="row-note">This catalog didn't answer. It may be down.</p>
			) : metas?.length === 0 ? (
				<p className="row-note">This catalog is empty right now.</p>
			) : (
				<PosterStrip>
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
