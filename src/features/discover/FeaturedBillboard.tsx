import { Check, Play, Plus, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
	getCatalog,
	getStreams,
	inWatchlist,
	toggleWatchlist,
} from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import type { MetaPreview } from "../../lib/bindings/MetaPreview";
import type { PlayerLocationState } from "../player/PlayerPage";

/** Big billboard above the board: a small rotating selection from the
 * first catalog, with direct playback for movies. */
function FeaturedBillboard({ catalog }: { catalog: CatalogDescriptor }) {
	const navigate = useNavigate();
	const [candidates, setCandidates] = useState<MetaPreview[]>([]);
	const [index, setIndex] = useState(0);
	const [saved, setSaved] = useState(false);
	const [starting, setStarting] = useState(false);

	useEffect(() => {
		getCatalog(catalog.transportUrl, catalog.type, catalog.id)
			.then((metas) => {
				const withArt = metas
					.filter((m) => m.background ?? m.poster)
					.slice(0, 5);
				setCandidates(withArt);
				setIndex(
					withArt.length > 0 ? Math.floor(Math.random() * withArt.length) : 0,
				);
			})
			.catch(() => {});
	}, [catalog]);

	const featured = candidates[index] ?? null;

	// Slow carousel; the dots also switch manually.
	useEffect(() => {
		if (candidates.length < 2) return;
		const timer = setInterval(
			() => setIndex((i) => (i + 1) % candidates.length),
			9000,
		);
		return () => clearInterval(timer);
	}, [candidates]);

	useEffect(() => {
		if (!featured) return;
		let stale = false;
		inWatchlist(featured.id)
			.then((value) => {
				if (!stale) setSaved(value);
			})
			.catch(() => {});
		return () => {
			stale = true;
		};
	}, [featured]);

	if (!featured) return null;

	const art = featured.background ?? featured.poster ?? undefined;
	const detailPath = `/detail/${featured.type}/${encodeURIComponent(featured.id)}`;

	// Movies play straight away with the first stream; series go to the
	// detail page since an episode has to be picked anyway.
	const watchNow = async () => {
		if (starting) return;
		if (featured.type !== "movie") {
			navigate(detailPath);
			return;
		}
		setStarting(true);
		try {
			const streams = await getStreams(featured.type, featured.id);
			if (streams.length === 0) {
				navigate(detailPath);
				return;
			}
			const state: PlayerLocationState = {
				stream: streams[0],
				title: featured.name,
				context: {
					metaId: featured.id,
					videoId: featured.id,
					contentType: featured.type,
					name: featured.name,
					poster: featured.poster,
					background: featured.background,
				},
			};
			navigate("/player", { state });
		} finally {
			setStarting(false);
		}
	};

	const toggleSaved = async () => {
		try {
			setSaved(
				await toggleWatchlist({
					metaId: featured.id,
					type: featured.type,
					name: featured.name,
					poster: featured.poster,
				}),
			);
		} catch {
			// The next page load shows the truth.
		}
	};

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
					<button
						type="button"
						className="btn"
						onClick={watchNow}
						disabled={starting}
					>
						<Play aria-hidden />
						{starting
							? "Finding a stream…"
							: featured.type === "movie"
								? "Watch now"
								: "Episodes"}
					</button>
					<button
						type="button"
						className="btn-circle"
						onClick={toggleSaved}
						aria-label={saved ? "In your library" : "Add to library"}
						title={saved ? "In your library" : "Add to library"}
					>
						{saved ? <Check aria-hidden /> : <Plus aria-hidden />}
					</button>
				</div>
			</div>
			{candidates.length > 1 && (
				<div className="billboard-dots">
					{candidates.map((candidate, i) => (
						<button
							type="button"
							key={candidate.id}
							className={i === index ? "dot dot-active" : "dot"}
							onClick={() => setIndex(i)}
							aria-label={`Show ${candidate.name}`}
						/>
					))}
				</div>
			)}
		</section>
	);
}

export default FeaturedBillboard;
