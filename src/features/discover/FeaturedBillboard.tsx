import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getCatalog } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";

/** Big billboard above the board: one title from the first catalog,
 * picked at random so the board greets you differently each time. */
function FeaturedBillboard({ catalog }: { catalog: CatalogDescriptor }) {
	const [featured, setFeatured] = useState<MetaPreview | null>(null);

	useEffect(() => {
		getCatalog(catalog.transportUrl, catalog.type, catalog.id)
			.then((metas) => {
				const candidates = metas
					.filter((m) => m.background ?? m.poster)
					.slice(0, 10);
				if (candidates.length > 0) {
					setFeatured(
						candidates[Math.floor(Math.random() * candidates.length)],
					);
				}
			})
			.catch(() => {});
	}, [catalog]);

	if (!featured) return null;

	const art = featured.background ?? featured.poster ?? undefined;

	return (
		<section
			className="billboard"
			style={art ? { backgroundImage: `url(${art})` } : undefined}
		>
			<div className="billboard-scrim" />
			<div className="billboard-content">
				<span className="billboard-eyebrow">Featured · {catalog.type}</span>
				<h1>{featured.name}</h1>
				<div className="billboard-meta">
					{featured.imdbRating && (
						<span className="rating">
							<Star aria-hidden />
							{featured.imdbRating}
						</span>
					)}
					{featured.releaseInfo && <span>{featured.releaseInfo}</span>}
					{featured.genres.slice(0, 3).map((genre) => (
						<span key={genre}>{genre}</span>
					))}
				</div>
				{featured.description && <p>{featured.description}</p>}
				<div className="billboard-actions">
					<Link
						to={`/detail/${featured.type}/${encodeURIComponent(featured.id)}`}
						className="btn"
					>
						View details
					</Link>
				</div>
			</div>
		</section>
	);
}

export default FeaturedBillboard;
