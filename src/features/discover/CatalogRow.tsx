import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { getCatalog } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";

function PosterCard({ meta }: { meta: MetaPreview }) {
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
				<span className="row-meta">
					{catalog.type} · {catalog.addonName}
				</span>
			</header>
			{failed ? (
				<p className="row-note">This catalog didn't answer. It may be down.</p>
			) : metas?.length === 0 ? (
				<p className="row-note">This catalog is empty right now.</p>
			) : (
				<div className="poster-strip">
					{metas
						? metas.map((meta) => <PosterCard key={meta.id} meta={meta} />)
						: SKELETON_KEYS.map((key) => (
								<div key={key} className="poster-skeleton" />
							))}
				</div>
			)}
		</section>
	);
}

export default CatalogRow;
