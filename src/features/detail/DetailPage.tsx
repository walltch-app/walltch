import { ArrowLeft, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getMeta } from "../../lib/api";
import type { MetaDetail } from "../../lib/bindings/MetaDetail";
import type { Video } from "../../lib/bindings/Video";
import StreamsSection from "./StreamsSection";
import "./detail.css";

function seasonLabel(season: number) {
	return season === 0 ? "Specials" : `Season ${season}`;
}

function episodeLabel(video: Video) {
	if (video.season != null && video.episode != null) {
		return `S${video.season} · E${video.episode}`;
	}
	return video.title ?? video.id;
}

function DetailPage() {
	const { type = "", id = "" } = useParams();
	const metaId = decodeURIComponent(id);
	const navigate = useNavigate();

	const [meta, setMeta] = useState<MetaDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [season, setSeason] = useState<number | null>(null);
	const [selected, setSelected] = useState<Video | null>(null);

	useEffect(() => {
		setMeta(null);
		setError(null);
		setSeason(null);
		setSelected(null);
		getMeta(type, metaId)
			.then(setMeta)
			.catch((e) => setError(String(e)));
	}, [type, metaId]);

	// Seasons in order, specials (0) last.
	const seasons = useMemo(() => {
		if (!meta) return [];
		const found = new Set<number>();
		for (const video of meta.videos) {
			if (video.season != null) found.add(video.season);
		}
		return [...found].sort(
			(a, b) => (a === 0 ? Infinity : a) - (b === 0 ? Infinity : b),
		);
	}, [meta]);

	useEffect(() => {
		if (season === null && seasons.length > 0) setSeason(seasons[0]);
	}, [season, seasons]);

	const episodes = useMemo(() => {
		if (!meta) return [];
		const inSeason =
			seasons.length === 0
				? meta.videos
				: meta.videos.filter((v) => v.season === season);
		return [...inSeason].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
	}, [meta, seasons, season]);

	const isSeries = meta !== null && meta.videos.length > 0;

	const metaLine = meta
		? [meta.releaseInfo, meta.runtime, ...meta.genres.slice(0, 3)].filter(
				Boolean,
			)
		: [];

	return (
		<div className="detail">
			<div
				className="hero"
				style={
					meta?.background
						? { backgroundImage: `url(${meta.background})` }
						: undefined
				}
			>
				<div className="hero-scrim" />
				<button
					type="button"
					className="back-btn"
					onClick={() => navigate(-1)}
					aria-label="Go back"
				>
					<ArrowLeft aria-hidden />
				</button>
				{meta && (
					<div className="hero-content">
						{meta.poster && (
							<img className="hero-poster" src={meta.poster} alt="" />
						)}
						<div className="hero-info">
							<h1>{meta.name}</h1>
							<div className="hero-meta">
								{meta.imdbRating && (
									<span className="rating">
										<Star aria-hidden />
										{meta.imdbRating}
									</span>
								)}
								{metaLine.map((part) => (
									<span key={part}>{part}</span>
								))}
							</div>
							{meta.description && (
								<p className="hero-overview">{meta.description}</p>
							)}
						</div>
					</div>
				)}
			</div>

			<div className="detail-body">
				{error && <p className="row-note">Couldn't load this title: {error}</p>}
				{!meta && !error && <p className="row-note">Loading…</p>}

				{isSeries && (
					<>
						{seasons.length > 1 && (
							<div className="season-chips">
								{seasons.map((s) => (
									<button
										key={s}
										type="button"
										className={s === season ? "chip chip-active" : "chip"}
										onClick={() => {
											setSeason(s);
											setSelected(null);
										}}
									>
										{seasonLabel(s)}
									</button>
								))}
							</div>
						)}
						<ul className="episode-list">
							{episodes.map((video) => (
								<li key={video.id}>
									<button
										type="button"
										className={
											selected?.id === video.id
												? "episode-row episode-active"
												: "episode-row"
										}
										onClick={() => setSelected(video)}
									>
										<span className="episode-code">{episodeLabel(video)}</span>
										<span className="episode-title">
											{video.title ?? "Untitled"}
										</span>
										{video.released && (
											<span className="episode-date">
												{video.released.slice(0, 10)}
											</span>
										)}
									</button>
								</li>
							))}
						</ul>
						{selected && meta && (
							<StreamsSection
								contentType={type}
								videoId={selected.id}
								label={`${episodeLabel(selected)} — ${selected.title ?? ""}`}
								title={meta.name}
								context={{
									metaId: meta.id,
									videoId: selected.id,
									contentType: type,
									name: meta.name,
									poster: meta.poster,
								}}
							/>
						)}
						{!selected && meta && (
							<p className="row-note">Pick an episode to see its streams.</p>
						)}
					</>
				)}

				{meta && !isSeries && (
					<StreamsSection
						contentType={type}
						videoId={meta.id}
						title={meta.name}
						context={{
							metaId: meta.id,
							videoId: meta.id,
							contentType: type,
							name: meta.name,
							poster: meta.poster,
						}}
					/>
				)}
			</div>
		</div>
	);
}

export default DetailPage;
