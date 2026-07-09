import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { getVideoProgress, resolveStream, saveProgress } from "../../lib/api";
import type { AddonStream } from "../../lib/bindings/AddonStream";
import "./player.css";

/** What the detail page knows about the thing being played. */
export type PlayContext = {
	metaId: string;
	videoId: string;
	contentType: string;
	name: string;
	poster: string | null;
};

export type PlayerLocationState = {
	stream: AddonStream;
	title?: string;
	context?: PlayContext;
};

const SAVE_EVERY_SECS = 10;
const MIN_POSITION_SECS = 10;

function PlayerPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const state = (location.state ?? null) as PlayerLocationState | null;

	const videoRef = useRef<HTMLVideoElement>(null);
	const lastSavedRef = useRef(0);
	const [playUrl, setPlayUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const context = state?.context ?? null;

	const persistPosition = useCallback(() => {
		const video = videoRef.current;
		if (!context || !video) return;
		const position = video.currentTime;
		const duration = video.duration;
		if (!Number.isFinite(duration) || duration <= 0) return;
		if (position < MIN_POSITION_SECS) return;
		saveProgress({
			metaId: context.metaId,
			videoId: context.videoId,
			type: context.contentType,
			name: context.name,
			poster: context.poster,
			positionSecs: position,
			durationSecs: duration,
		}).catch(() => {
			// Losing one progress tick is not worth interrupting playback.
		});
	}, [context]);

	useEffect(() => {
		if (!state) return;
		let stale = false;
		resolveStream(state.stream)
			.then((resolved) => {
				if (!stale) setPlayUrl(resolved.playUrl);
			})
			.catch((e) => {
				if (!stale) setError(String(e));
			});
		return () => {
			stale = true;
		};
	}, [state]);

	// Save the final position when leaving the player.
	useEffect(() => persistPosition, [persistPosition]);

	// Opened directly without a stream (e.g. after a reload): nothing to play.
	useEffect(() => {
		if (!state) navigate("/", { replace: true });
	}, [state, navigate]);
	if (!state) return null;

	const title = state.title ?? state.stream.name ?? "Now playing";
	const notWebReady = state.stream.behaviorHints.notWebReady;

	const onLoadedMetadata = async () => {
		const video = videoRef.current;
		if (!context || !video) return;
		try {
			const progress = await getVideoProgress(context.videoId);
			// Resume a little before where they left off, unless the file is
			// basically over.
			if (
				progress &&
				progress.positionSecs > MIN_POSITION_SECS &&
				progress.positionSecs < video.duration - 30
			) {
				video.currentTime = Math.max(0, progress.positionSecs - 5);
			}
		} catch {
			// Start from the beginning if the lookup fails.
		}
	};

	const onTimeUpdate = () => {
		const video = videoRef.current;
		if (!video) return;
		if (Math.abs(video.currentTime - lastSavedRef.current) < SAVE_EVERY_SECS)
			return;
		lastSavedRef.current = video.currentTime;
		persistPosition();
	};

	return (
		<div className="player">
			<div className="player-topbar">
				<button
					type="button"
					className="back-btn"
					onClick={() => navigate(-1)}
					aria-label="Go back"
				>
					<ArrowLeft aria-hidden />
				</button>
				<span className="player-title">{title}</span>
			</div>

			{error && (
				<div className="player-status">
					<p className="player-error">{error}</p>
					{notWebReady && (
						<p className="player-hint">
							This file's format likely needs the upgraded player (coming in a
							later version). A different stream may work in the meantime.
						</p>
					)}
				</div>
			)}

			{!error && !playUrl && (
				<div className="player-status">
					<div className="spinner" aria-hidden />
					<p>Preparing stream…</p>
					<p className="player-hint">
						Torrents need a moment to find peers before playback starts.
					</p>
				</div>
			)}

			{!error && playUrl && (
				// biome-ignore lint/a11y/useMediaCaption: subtitles arrive in a later phase
				<video
					ref={videoRef}
					src={playUrl}
					controls
					autoPlay
					onLoadedMetadata={onLoadedMetadata}
					onTimeUpdate={onTimeUpdate}
					onPause={persistPosition}
					onEnded={persistPosition}
					onError={() =>
						setError(
							notWebReady
								? "The built-in player can't decode this file."
								: "Playback failed for this stream.",
						)
					}
				/>
			)}
		</div>
	);
}

export default PlayerPage;
