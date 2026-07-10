import { ArrowLeft, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
	command,
	destroy,
	init,
	type MpvConfig,
	type MpvObservableProperty,
	observeProperties,
} from "tauri-plugin-libmpv-api";
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

const OBSERVED_PROPERTIES = [
	["pause", "flag"],
	["time-pos", "double", "none"],
	["duration", "double", "none"],
	["eof-reached", "flag", "none"],
] as const satisfies MpvObservableProperty[];

const MPV_CONFIG: MpvConfig = {
	initialOptions: {
		vo: "gpu-next",
		hwdec: "auto-safe",
		"keep-open": "yes",
		"force-window": "yes",
	},
	observedProperties: OBSERVED_PROPERTIES,
};

function formatTime(secs: number) {
	const total = Math.max(0, Math.floor(secs));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(2, "0");
	const ss = String(s).padStart(2, "0");
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function useProgressSaver(context: PlayContext | null) {
	const positionRef = useRef(0);
	const durationRef = useRef(0);
	const lastSavedRef = useRef(0);

	const persist = useCallback(() => {
		if (!context) return;
		const position = positionRef.current;
		const duration = durationRef.current;
		if (duration <= 0 || position < MIN_POSITION_SECS) return;
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

	return { positionRef, durationRef, lastSavedRef, persist };
}

/** The upgraded player: mpv renders behind the transparent webview. */
function MpvPlayer({
	url,
	context,
	onError,
}: {
	url: string;
	context: PlayContext | null;
	onError: (message: string) => void;
}) {
	const [paused, setPaused] = useState(false);
	const [timePos, setTimePos] = useState(0);
	const [duration, setDuration] = useState(0);
	const resumeTargetRef = useRef<number | null>(null);
	const resumeAppliedRef = useRef(false);
	const { positionRef, durationRef, lastSavedRef, persist } =
		useProgressSaver(context);

	useEffect(() => {
		if (!context) return;
		getVideoProgress(context.videoId)
			.then((progress) => {
				if (progress) resumeTargetRef.current = progress.positionSecs;
			})
			.catch(() => {});
	}, [context]);

	useEffect(() => {
		let active = true;
		let unlisten: (() => void) | undefined;
		(async () => {
			try {
				unlisten = await observeProperties(
					OBSERVED_PROPERTIES,
					({ name, data }) => {
						switch (name) {
							case "pause":
								setPaused(data);
								break;
							case "time-pos":
								if (data !== null) {
									positionRef.current = data;
									setTimePos(data);
									if (
										Math.abs(data - lastSavedRef.current) >= SAVE_EVERY_SECS
									) {
										lastSavedRef.current = data;
										persist();
									}
								}
								break;
							case "duration":
								if (data !== null && data > 0) {
									durationRef.current = data;
									setDuration(data);
									if (!resumeAppliedRef.current) {
										resumeAppliedRef.current = true;
										const target = resumeTargetRef.current;
										if (
											target !== null &&
											target > MIN_POSITION_SECS &&
											target < data - 30
										) {
											command("seek", [
												Math.max(0, target - 5),
												"absolute",
											]).catch(() => {});
										}
									}
								}
								break;
							case "eof-reached":
								if (data) {
									// Watched to the end: record as finished.
									positionRef.current = durationRef.current;
									persist();
								}
								break;
						}
					},
				);
				await command("loadfile", [url]);
			} catch (e) {
				if (active) onError(String(e));
			}
		})();
		return () => {
			active = false;
			persist();
			unlisten?.();
		};
	}, [url, persist, onError, positionRef, durationRef, lastSavedRef]);

	const togglePause = useCallback(() => {
		command("cycle", ["pause"]).catch(() => {});
	}, []);

	const seekTo = useCallback(
		(position: number) => {
			positionRef.current = position;
			setTimePos(position);
			command("seek", [position, "absolute"]).catch(() => {});
		},
		[positionRef],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === " ") {
				event.preventDefault();
				togglePause();
			} else if (event.key === "ArrowRight") {
				command("seek", [10, "relative"]).catch(() => {});
			} else if (event.key === "ArrowLeft") {
				command("seek", [-10, "relative"]).catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [togglePause]);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-pause convenience; the button below is the accessible control */}
			<div
				className="player-click-layer"
				onClick={togglePause}
				onKeyDown={() => {}}
			/>
			<div className="player-controls">
				<button
					type="button"
					className="control-btn"
					onClick={togglePause}
					aria-label={paused ? "Play" : "Pause"}
				>
					{paused ? <Play aria-hidden /> : <Pause aria-hidden />}
				</button>
				<span className="control-time">{formatTime(timePos)}</span>
				<input
					type="range"
					className="control-seek"
					min={0}
					max={duration || 1}
					step={0.5}
					value={Math.min(timePos, duration || 1)}
					disabled={!duration}
					onChange={(e) => seekTo(Number(e.currentTarget.value))}
					aria-label="Seek"
				/>
				<span className="control-time">{formatTime(duration)}</span>
			</div>
		</>
	);
}

/** Fallback when mpv isn't available: the plain webview video element. */
function HtmlVideoPlayer({
	url,
	context,
	notWebReady,
	onError,
}: {
	url: string;
	context: PlayContext | null;
	notWebReady: boolean;
	onError: (message: string) => void;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const { positionRef, durationRef, lastSavedRef, persist } =
		useProgressSaver(context);

	useEffect(() => persist, [persist]);

	const syncFromVideo = () => {
		const video = videoRef.current;
		if (!video) return;
		positionRef.current = video.currentTime;
		if (Number.isFinite(video.duration)) durationRef.current = video.duration;
	};

	return (
		// biome-ignore lint/a11y/useMediaCaption: subtitles arrive in a later phase
		<video
			ref={videoRef}
			src={url}
			controls
			autoPlay
			onLoadedMetadata={async () => {
				const video = videoRef.current;
				if (!context || !video) return;
				try {
					const progress = await getVideoProgress(context.videoId);
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
			}}
			onTimeUpdate={() => {
				const video = videoRef.current;
				if (!video) return;
				syncFromVideo();
				if (
					Math.abs(video.currentTime - lastSavedRef.current) >= SAVE_EVERY_SECS
				) {
					lastSavedRef.current = video.currentTime;
					persist();
				}
			}}
			onPause={() => {
				syncFromVideo();
				persist();
			}}
			onEnded={() => {
				syncFromVideo();
				persist();
			}}
			onError={() =>
				onError(
					notWebReady
						? "The built-in player can't decode this file."
						: "Playback failed for this stream.",
				)
			}
		/>
	);
}

function PlayerPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const state = (location.state ?? null) as PlayerLocationState | null;

	const [playUrl, setPlayUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// null = still initializing, false = mpv unavailable (fall back to <video>)
	const [mpvReady, setMpvReady] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				// A leftover instance from a previous session would make init fail.
				await destroy().catch(() => {});
				await init(MPV_CONFIG);
				if (active) setMpvReady(true);
			} catch {
				if (active) setMpvReady(false);
			}
		})();
		return () => {
			active = false;
			destroy().catch(() => {});
		};
	}, []);

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
	const context = state.context ?? null;
	const mpvActive = mpvReady === true && playUrl !== null && !error;

	return (
		<div className={mpvActive ? "player" : "player opaque"}>
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
					{notWebReady && mpvReady === false && (
						<p className="player-hint">
							This file's format needs mpv, which didn't load. A different
							stream may work in the meantime.
						</p>
					)}
				</div>
			)}

			{!error && (!playUrl || mpvReady === null) && (
				<div className="player-status">
					<div className="spinner" aria-hidden />
					<p>Preparing stream…</p>
					<p className="player-hint">
						Torrents need a moment to find peers before playback starts.
					</p>
				</div>
			)}

			{!error && playUrl && mpvReady === true && (
				<MpvPlayer url={playUrl} context={context} onError={setError} />
			)}

			{!error && playUrl && mpvReady === false && (
				<HtmlVideoPlayer
					url={playUrl}
					context={context}
					notWebReady={notWebReady}
					onError={setError}
				/>
			)}
		</div>
	);
}

export default PlayerPage;
