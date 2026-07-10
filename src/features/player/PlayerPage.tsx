import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
	ArrowLeft,
	AudioLines,
	Captions,
	Check,
	FolderOpen,
	Gauge,
	Maximize,
	Minimize,
	Pause,
	Play,
	RotateCcw,
	RotateCw,
	Volume2,
	VolumeX,
} from "lucide-react";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import {
	command,
	destroy,
	init,
	type MpvConfig,
	type MpvObservableProperty,
	observeProperties,
	setProperty,
} from "tauri-plugin-libmpv-api";
import {
	getSettings,
	getSubtitles,
	getVideoProgress,
	resolveStream,
	saveProgress,
} from "../../lib/api";
import type { AddonStream } from "../../lib/bindings/AddonStream";
import type { AddonSubtitle } from "../../lib/bindings/AddonSubtitle";
import type { Settings } from "../../lib/bindings/Settings";
import { langAliases, langMatches } from "../../lib/lang";
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
const CONTROLS_IDLE_MS = 2600;

const OBSERVED_PROPERTIES = [
	["pause", "flag"],
	["time-pos", "double", "none"],
	["duration", "double", "none"],
	["eof-reached", "flag", "none"],
	["track-list", "node", "none"],
	["volume", "double"],
	["mute", "flag"],
	["speed", "double"],
	["paused-for-cache", "flag", "none"],
	["demuxer-cache-time", "double", "none"],
] as const satisfies MpvObservableProperty[];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** One entry of mpv's track-list property; only the fields we read. */
type MpvTrack = {
	id: number;
	type: "audio" | "sub" | "video";
	lang?: string | null;
	title?: string | null;
	selected?: boolean;
	external?: boolean;
};

function trackLabel(track: MpvTrack) {
	const name = track.title ?? `Track ${track.id}`;
	return track.lang ? `${name} · ${track.lang}` : name;
}

function mpvConfig(settings: Settings | null): MpvConfig {
	const initialOptions: Record<string, string> = {
		vo: "gpu-next",
		hwdec: settings?.hardwareDecoding === false ? "no" : "auto-safe",
		"sub-scale": String(settings?.subtitleScale ?? 1),
		"sub-color": settings?.subtitleColor || "#ffffff",
		"keep-open": "yes",
		"force-window": "yes",
	};
	if (settings?.subtitleBackground) {
		// mpv takes #AARRGGBB; B3 ≈ 70% black.
		initialOptions["sub-back-color"] = "#B3000000";
	}
	if (settings?.preferredSubtitleLang) {
		// Lets mpv auto-pick matching embedded tracks on its own.
		initialOptions.slang = langAliases(settings.preferredSubtitleLang).join(
			",",
		);
	}
	return { initialOptions, observedProperties: OBSERVED_PROPERTIES };
}

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

/** Custom seek bar: filled + buffered regions, click and drag to seek. */
function SeekBar({
	position,
	duration,
	buffered,
	onSeek,
}: {
	position: number;
	duration: number;
	buffered: number;
	onSeek: (position: number) => void;
}) {
	const barRef = useRef<HTMLDivElement>(null);
	const [dragPos, setDragPos] = useState<number | null>(null);
	const lastSentRef = useRef(0);

	const fractionAt = (clientX: number) => {
		const el = barRef.current;
		if (!el) return 0;
		const rect = el.getBoundingClientRect();
		return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
	};

	const shown = dragPos ?? position;
	const playedPct = duration > 0 ? (shown / duration) * 100 : 0;
	const bufferedPct =
		duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (duration <= 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragPos(fractionAt(event.clientX) * duration);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (dragPos === null || duration <= 0) return;
		const next = fractionAt(event.clientX) * duration;
		setDragPos(next);
		// Live-scrub, but don't flood mpv with seeks.
		const now = Date.now();
		if (now - lastSentRef.current > 150) {
			lastSentRef.current = now;
			onSeek(next);
		}
	};

	const onPointerUp = () => {
		if (dragPos !== null) onSeek(dragPos);
		setDragPos(null);
	};

	return (
		<div
			ref={barRef}
			className="seekbar"
			role="slider"
			aria-label="Seek"
			aria-valuemin={0}
			aria-valuemax={Math.round(duration)}
			aria-valuenow={Math.round(shown)}
			aria-valuetext={formatTime(shown)}
			tabIndex={0}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onKeyDown={(event) => {
				if (event.key === "ArrowRight") onSeek(position + 10);
				if (event.key === "ArrowLeft") onSeek(position - 10);
			}}
		>
			<div className="seekbar-track">
				<div
					className="seekbar-buffered"
					style={{ width: `${bufferedPct}%` }}
				/>
				<div className="seekbar-played" style={{ width: `${playedPct}%` }} />
			</div>
			<div className="seekbar-thumb" style={{ left: `${playedPct}%` }} />
		</div>
	);
}

/** The upgraded player: mpv renders behind the transparent webview. */
function MpvPlayer({
	url,
	title,
	context,
	preferredSubtitleLang,
	onError,
}: {
	url: string;
	title: string;
	context: PlayContext | null;
	preferredSubtitleLang: string;
	onError: (message: string) => void;
}) {
	const navigate = useNavigate();
	const [paused, setPaused] = useState(false);
	const [timePos, setTimePos] = useState(0);
	const [duration, setDuration] = useState(0);
	const [buffered, setBuffered] = useState(0);
	const [buffering, setBuffering] = useState(false);
	const [tracks, setTracks] = useState<MpvTrack[]>([]);
	const [openMenu, setOpenMenu] = useState<"subs" | "audio" | "speed" | null>(
		null,
	);
	const [addonSubs, setAddonSubs] = useState<AddonSubtitle[] | null>(null);
	const [volume, setVolume] = useState(100);
	const [muted, setMuted] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [fullscreen, setFullscreen] = useState(false);
	const [awake, setAwake] = useState(true);
	const idleTimer = useRef<number>(0);
	const resumeTargetRef = useRef<number | null>(null);
	const resumeAppliedRef = useRef(false);
	const { positionRef, durationRef, lastSavedRef, persist } =
		useProgressSaver(context);

	// Controls follow the mouse: any movement wakes them, silence puts them
	// back to sleep while something is playing.
	const wake = useCallback(() => {
		setAwake(true);
		window.clearTimeout(idleTimer.current);
		idleTimer.current = window.setTimeout(
			() => setAwake(false),
			CONTROLS_IDLE_MS,
		);
	}, []);

	useEffect(() => {
		wake();
		window.addEventListener("mousemove", wake);
		return () => {
			window.removeEventListener("mousemove", wake);
			window.clearTimeout(idleTimer.current);
		};
	}, [wake]);

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
							case "track-list":
								setTracks(((data as MpvTrack[] | null) ?? []).filter(Boolean));
								break;
							case "volume":
								setVolume(data);
								break;
							case "mute":
								setMuted(data);
								break;
							case "speed":
								setSpeed(data);
								break;
							case "paused-for-cache":
								setBuffering(data ?? false);
								break;
							case "demuxer-cache-time":
								if (data !== null) setBuffered(data);
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
			const clamped = Math.max(0, position);
			positionRef.current = clamped;
			setTimePos(clamped);
			command("seek", [clamped, "absolute"]).catch(() => {});
		},
		[positionRef],
	);

	const toggleMute = useCallback(() => {
		command("cycle", ["mute"]).catch(() => {});
	}, []);

	const toggleFullscreen = useCallback(async () => {
		try {
			const win = getCurrentWindow();
			const next = !(await win.isFullscreen());
			await win.setFullscreen(next);
			setFullscreen(next);
		} catch {
			// Fullscreen is a nicety; ignore if the window API refuses.
		}
	}, []);

	// Leaving the player shouldn't leave the app stuck in fullscreen.
	useEffect(() => {
		return () => {
			getCurrentWindow()
				.setFullscreen(false)
				.catch(() => {});
		};
	}, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			wake();
			switch (event.key) {
				case " ":
					event.preventDefault();
					togglePause();
					break;
				case "ArrowRight":
					command("seek", [10, "relative"]).catch(() => {});
					break;
				case "ArrowLeft":
					command("seek", [-10, "relative"]).catch(() => {});
					break;
				case "ArrowUp":
					event.preventDefault();
					command("add", ["volume", 5]).catch(() => {});
					break;
				case "ArrowDown":
					event.preventDefault();
					command("add", ["volume", -5]).catch(() => {});
					break;
				case "m":
					toggleMute();
					break;
				case "f":
					toggleFullscreen();
					break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [togglePause, toggleMute, toggleFullscreen, wake]);

	const subTracks = tracks.filter((t) => t.type === "sub");
	const audioTracks = tracks.filter((t) => t.type === "audio");
	const subtitlesOff = !subTracks.some((t) => t.selected);
	const chromeVisible = awake || paused || openMenu !== null;
	const autoSubDoneRef = useRef(false);

	// If no embedded track satisfies the preferred subtitle language (mpv's
	// slang already tried), pull one from the subtitle addons.
	useEffect(() => {
		if (autoSubDoneRef.current || !preferredSubtitleLang || !context) return;
		if (tracks.length === 0) return;
		autoSubDoneRef.current = true;
		const alreadyGood = tracks.some(
			(t) =>
				t.type === "sub" &&
				t.selected &&
				t.lang &&
				langMatches(preferredSubtitleLang, t.lang),
		);
		if (alreadyGood) return;
		getSubtitles(context.contentType, context.videoId)
			.then((subs) => {
				setAddonSubs(subs);
				const match = subs.find((s) =>
					langMatches(preferredSubtitleLang, s.lang),
				);
				if (match) {
					command("sub-add", [
						match.url,
						"select",
						`${match.lang} (${match.addonName})`,
						match.lang,
					]).catch(() => {});
				}
			})
			.catch(() => {});
	}, [tracks, context, preferredSubtitleLang]);

	const toggleSubsMenu = () => {
		setOpenMenu((menu) => (menu === "subs" ? null : "subs"));
		if (addonSubs === null && context) {
			getSubtitles(context.contentType, context.videoId)
				.then(setAddonSubs)
				.catch(() => setAddonSubs([]));
		}
	};

	const addAddonSubtitle = (sub: AddonSubtitle) => {
		command("sub-add", [
			sub.url,
			"select",
			`${sub.lang} (${sub.addonName})`,
			sub.lang,
		]).catch(() => {});
		setOpenMenu(null);
	};

	const addLocalSubtitle = async () => {
		setOpenMenu(null);
		const file = await openFileDialog({
			multiple: false,
			filters: [
				{ name: "Subtitles", extensions: ["srt", "ass", "ssa", "sub", "vtt"] },
			],
		}).catch(() => null);
		if (typeof file === "string") {
			command("sub-add", [file, "select"]).catch(() => {});
		}
	};

	return (
		<div className={chromeVisible ? "chrome" : "chrome chrome-hidden"}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-pause convenience; the play button is the accessible control */}
			<div
				className="player-click-layer"
				onClick={() => {
					if (openMenu) setOpenMenu(null);
					else togglePause();
				}}
				onDoubleClick={toggleFullscreen}
				onKeyDown={() => {}}
			/>

			<div className="player-topbar">
				<button
					type="button"
					className="icon-btn"
					onClick={() => navigate(-1)}
					aria-label="Go back"
				>
					<ArrowLeft aria-hidden />
				</button>
				<span className="player-title">{title}</span>
			</div>

			{buffering && (
				<div className="center-status">
					<div className="spinner" aria-hidden />
				</div>
			)}
			{!buffering && paused && (
				<div className="center-status center-paused" aria-hidden>
					<Play />
				</div>
			)}

			<div className="chrome-bar">
				<SeekBar
					position={timePos}
					duration={duration}
					buffered={buffered}
					onSeek={seekTo}
				/>
				<div className="chrome-controls">
					<button
						type="button"
						className="icon-btn play-btn"
						onClick={togglePause}
						aria-label={paused ? "Play" : "Pause"}
					>
						{paused ? <Play aria-hidden /> : <Pause aria-hidden />}
					</button>
					<button
						type="button"
						className="icon-btn skip-btn"
						onClick={() => command("seek", [-10, "relative"]).catch(() => {})}
						aria-label="Back 10 seconds"
					>
						<RotateCcw aria-hidden />
						<i>10</i>
					</button>
					<button
						type="button"
						className="icon-btn skip-btn"
						onClick={() => command("seek", [10, "relative"]).catch(() => {})}
						aria-label="Forward 10 seconds"
					>
						<RotateCw aria-hidden />
						<i>10</i>
					</button>

					<div className="volume-group">
						<button
							type="button"
							className="icon-btn"
							onClick={toggleMute}
							aria-label={muted ? "Unmute" : "Mute"}
						>
							{muted || volume === 0 ? (
								<VolumeX aria-hidden />
							) : (
								<Volume2 aria-hidden />
							)}
						</button>
						<input
							type="range"
							className="volume-slider"
							min={0}
							max={100}
							step={1}
							value={muted ? 0 : Math.round(volume)}
							onChange={(e) => {
								setProperty("volume", Number(e.currentTarget.value)).catch(
									() => {},
								);
								if (muted) setProperty("mute", false).catch(() => {});
							}}
							aria-label="Volume"
						/>
					</div>

					<span className="time-label">
						{formatTime(timePos)}
						<em> / {formatTime(duration)}</em>
					</span>

					<div className="chrome-spacer" />

					<div className="menu-anchor">
						<button
							type="button"
							className={
								openMenu === "speed" ? "icon-btn icon-active" : "icon-btn"
							}
							onClick={() =>
								setOpenMenu((menu) => (menu === "speed" ? null : "speed"))
							}
							aria-label="Playback speed"
							aria-expanded={openMenu === "speed"}
						>
							<Gauge aria-hidden />
						</button>
						{openMenu === "speed" && (
							<div className="track-menu" role="menu">
								{SPEED_OPTIONS.map((option) => (
									<button
										type="button"
										key={option}
										onClick={() => {
											setProperty("speed", option).catch(() => {});
											setOpenMenu(null);
										}}
									>
										<span>{option}×</span>
										{Math.abs(speed - option) < 0.01 && <Check aria-hidden />}
									</button>
								))}
							</div>
						)}
					</div>

					{audioTracks.length > 1 && (
						<div className="menu-anchor">
							<button
								type="button"
								className={
									openMenu === "audio" ? "icon-btn icon-active" : "icon-btn"
								}
								onClick={() =>
									setOpenMenu((menu) => (menu === "audio" ? null : "audio"))
								}
								aria-label="Audio track"
								aria-expanded={openMenu === "audio"}
							>
								<AudioLines aria-hidden />
							</button>
							{openMenu === "audio" && (
								<div className="track-menu" role="menu">
									{audioTracks.map((track) => (
										<button
											type="button"
											key={track.id}
											onClick={() => {
												setProperty("aid", track.id).catch(() => {});
												setOpenMenu(null);
											}}
										>
											<span>{trackLabel(track)}</span>
											{track.selected && <Check aria-hidden />}
										</button>
									))}
								</div>
							)}
						</div>
					)}

					<div className="menu-anchor">
						<button
							type="button"
							className={
								openMenu === "subs" ? "icon-btn icon-active" : "icon-btn"
							}
							onClick={toggleSubsMenu}
							aria-label="Subtitles"
							aria-expanded={openMenu === "subs"}
						>
							<Captions aria-hidden />
						</button>
						{openMenu === "subs" && (
							<div className="track-menu" role="menu">
								<button
									type="button"
									onClick={() => {
										setProperty("sid", "no").catch(() => {});
										setOpenMenu(null);
									}}
								>
									<span>Off</span>
									{subtitlesOff && <Check aria-hidden />}
								</button>
								{subTracks.map((track) => (
									<button
										type="button"
										key={track.id}
										onClick={() => {
											setProperty("sid", track.id).catch(() => {});
											setOpenMenu(null);
										}}
									>
										<span>{trackLabel(track)}</span>
										{track.selected && <Check aria-hidden />}
									</button>
								))}
								{addonSubs && addonSubs.length > 0 && (
									<>
										<div className="menu-section">From addons</div>
										{addonSubs.map((sub) => (
											<button
												type="button"
												key={`${sub.addonName}-${sub.id ?? sub.url}`}
												onClick={() => addAddonSubtitle(sub)}
											>
												<span>
													{sub.lang} · {sub.addonName}
												</span>
											</button>
										))}
									</>
								)}
								{addonSubs === null && context && (
									<div className="menu-section">Loading addon subtitles…</div>
								)}
								<button type="button" onClick={addLocalSubtitle}>
									<span>Load subtitle file…</span>
									<FolderOpen aria-hidden />
								</button>
							</div>
						)}
					</div>

					<button
						type="button"
						className="icon-btn"
						onClick={toggleFullscreen}
						aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
					>
						{fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
					</button>
				</div>
			</div>
		</div>
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
		// biome-ignore lint/a11y/useMediaCaption: subtitles come from addons/mpv
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
	const [playerSettings, setPlayerSettings] = useState<Settings | null>(null);
	// null = still initializing, false = mpv unavailable (fall back to <video>)
	const [mpvReady, setMpvReady] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				const settings = await getSettings().catch(() => null);
				if (active && settings) setPlayerSettings(settings);
				if (settings && !settings.useMpv) {
					if (active) setMpvReady(false);
					return;
				}
				// A leftover instance from a previous session would make init fail.
				await destroy().catch(() => {});
				await init(mpvConfig(settings));
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
			{error && (
				<>
					<div className="player-topbar chrome">
						<button
							type="button"
							className="icon-btn"
							onClick={() => navigate(-1)}
							aria-label="Go back"
						>
							<ArrowLeft aria-hidden />
						</button>
						<span className="player-title">{title}</span>
					</div>
					<div className="player-status">
						<p className="player-error">{error}</p>
						{notWebReady && mpvReady === false && (
							<p className="player-hint">
								This file's format needs mpv, which didn't load. A different
								stream may work in the meantime.
							</p>
						)}
					</div>
				</>
			)}

			{!error && (!playUrl || mpvReady === null) && (
				<>
					<div className="player-topbar chrome">
						<button
							type="button"
							className="icon-btn"
							onClick={() => navigate(-1)}
							aria-label="Go back"
						>
							<ArrowLeft aria-hidden />
						</button>
						<span className="player-title">{title}</span>
					</div>
					<div className="player-status">
						<div className="spinner" aria-hidden />
						<p>Preparing stream…</p>
						<p className="player-hint">
							Torrents need a moment to find peers before playback starts.
						</p>
					</div>
				</>
			)}

			{!error && playUrl && mpvReady === true && (
				<MpvPlayer
					url={playUrl}
					title={title}
					context={context}
					preferredSubtitleLang={playerSettings?.preferredSubtitleLang ?? ""}
					onError={setError}
				/>
			)}

			{!error && playUrl && mpvReady === false && (
				<>
					<div className="player-topbar chrome">
						<button
							type="button"
							className="icon-btn"
							onClick={() => navigate(-1)}
							aria-label="Go back"
						>
							<ArrowLeft aria-hidden />
						</button>
						<span className="player-title">{title}</span>
					</div>
					<HtmlVideoPlayer
						url={playUrl}
						context={context}
						notWebReady={notWebReady}
						onError={setError}
					/>
				</>
			)}
		</div>
	);
}

export default PlayerPage;
