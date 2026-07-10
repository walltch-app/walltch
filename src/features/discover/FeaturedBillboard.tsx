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

	// Tint the whole canvas with the artwork's dominant color, so the app
	// takes on the mood of whatever is featured instead of one fixed look.
	useEffect(() => {
		if (!featured) return;
		const src = featured.background ?? featured.poster;
		if (!src) return;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = 24;
				canvas.height = 24;
				const ctx = canvas.getContext("2d");
				if (!ctx) return;
				ctx.drawImage(image, 0, 0, 24, 24);
				const { data } = ctx.getImageData(0, 0, 24, 24);
				let r = 0;
				let g = 0;
				let b = 0;
				let count = 0;
				for (let i = 0; i < data.length; i += 4) {
					const max = Math.max(data[i], data[i + 1], data[i + 2]);
					const min = Math.min(data[i], data[i + 1], data[i + 2]);
					// Only colorful pixels vote; gray skies shouldn't wash it out.
					if (max < 40 || max - min < 26) continue;
					r += data[i];
					g += data[i + 1];
					b += data[i + 2];
					count++;
				}
				if (count < 12) return;
				document.documentElement.style.setProperty(
					"--ambient",
					`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`,
				);
			} catch {
				// Canvas tainted by a CORS-less image host: keep the accent tint.
			}
		};
		image.src = src;
	}, [featured]);

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
