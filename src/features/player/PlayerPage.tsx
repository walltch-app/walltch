import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { resolveStream } from "../../lib/api";
import type { AddonStream } from "../../lib/bindings/AddonStream";
import "./player.css";

export type PlayerLocationState = {
	stream: AddonStream;
	title?: string;
};

function PlayerPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const state = (location.state ?? null) as PlayerLocationState | null;

	const [playUrl, setPlayUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

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

	// Opened directly without a stream (e.g. after a reload): nothing to play.
	useEffect(() => {
		if (!state) navigate("/", { replace: true });
	}, [state, navigate]);
	if (!state) return null;

	const title = state.title ?? state.stream.name ?? "Now playing";
	const notWebReady = state.stream.behaviorHints.notWebReady;

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
					src={playUrl}
					controls
					autoPlay
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
