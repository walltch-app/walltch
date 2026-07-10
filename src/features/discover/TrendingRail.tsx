import { Star, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getCatalog } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";

/** The mock's right rail: a small trending panel fed by a second catalog,
 * ranked by rating. Hidden on narrow windows and while empty. */
function TrendingRail({ catalogs }: { catalogs: CatalogDescriptor[] | null }) {
	const [items, setItems] = useState<MetaPreview[]>([]);
	// The billboard already uses the first catalog; trend from the next one.
	const source =
		catalogs && catalogs.length > 0 ? (catalogs[1] ?? catalogs[0]) : null;

	useEffect(() => {
		if (!source) return;
		getCatalog(source.transportUrl, source.type, source.id)
			.then((metas) => {
				const rated = metas
					.filter((m) => m.imdbRating)
					.sort((a, b) => Number(b.imdbRating) - Number(a.imdbRating))
					.slice(0, 4);
				setItems(rated.length > 0 ? rated : metas.slice(0, 4));
			})
			.catch(() => {});
	}, [source]);

	if (!source || items.length === 0) return null;

	return (
		<aside className="home-rail">
			<div className="rail-card">
				<header>
					<TrendingUp aria-hidden />
					<h3>Trending</h3>
				</header>
				<ul className="rail-list">
					{items.map((meta) => (
						<li key={meta.id}>
							<Link
								className="rail-item"
								to={`/detail/${meta.type}/${encodeURIComponent(meta.id)}`}
							>
								{meta.poster ? (
									<img src={meta.poster} alt="" loading="lazy" />
								) : (
									<div className="rail-thumb-fallback" aria-hidden>
										{meta.name.slice(0, 1)}
									</div>
								)}
								<div className="rail-info">
									<span className="rail-name">{meta.name}</span>
									{meta.imdbRating && (
										<span className="rail-rating">
											<Star aria-hidden />
											{meta.imdbRating}
										</span>
									)}
								</div>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</aside>
	);
}

export default TrendingRail;
