import { ChevronDown, Play, TriangleAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getStreamTiers } from "@/lib/api";
import type { RankedStream } from "@/lib/bindings/RankedStream";
import type { StreamTier } from "@/lib/bindings/StreamTier";
import type { PlayContext, PlayerLocationState } from "../player/PlayerPage";

const SKELETON_KEYS = ["a", "b", "c"];

// Streams carry no id; the source itself is the most stable key we have.
function streamKey(stream: RankedStream): string {
	if ("url" in stream) return `${stream.addonName}|${stream.url}`;
	if ("infoHash" in stream) {
		return `${stream.addonName}|${stream.infoHash}:${stream.fileIdx ?? ""}`;
	}
	if ("ytId" in stream) return `${stream.addonName}|yt:${stream.ytId}`;
	return `${stream.addonName}|${stream.externalUrl}`;
}

function formatSize(bytes: bigint | null): string | null {
	if (bytes === null) return null;
	const gb = Number(bytes) / 1e9;
	return gb >= 1
		? `${gb.toFixed(1)} GB`
		: `${Math.round(Number(bytes) / 1e6)} MB`;
}

/** What the release is, in words: "WEB-DL · H.265 · Atmos". The raw file name
 * stays available on hover for anyone who wants it. */
function releaseLine(stream: RankedStream): string {
	const { source, codec, audio, hdr } = stream.facts;
	const parts = [source, hdr ? "HDR" : null, codec, audio].filter(Boolean);
	if (parts.length > 0) return parts.join(" · ");
	return stream.facts.release ?? stream.name ?? "Stream";
}

/** Swarm, size and who served it — the numbers that decide if it plays well. */
function Facts({
	stream,
	className,
}: {
	stream: RankedStream;
	className?: string;
}) {
	const { seeders, sizeBytes } = stream.facts;
	const size = formatSize(sizeBytes);
	return (
		<div
			className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted ${className ?? ""}`}
		>
			{seeders !== null && (
				<span className="inline-flex items-center gap-1 tabular-nums">
					<Users className="size-3.5" aria-hidden />
					{seeders}
				</span>
			)}
			{size && <span className="tabular-nums">{size}</span>}
			<span className="opacity-70">{stream.addonName}</span>
			{!stream.playable && (
				<span
					className="inline-flex items-center gap-1 text-amber-400/90"
					title="Your player is set to the basic web player, which can't decode this file"
				>
					<TriangleAlert className="size-3.5" aria-hidden />
					May not play
				</span>
			)}
		</div>
	);
}

function TierCard({
	tier,
	onPlay,
}: {
	tier: StreamTier;
	onPlay: (stream: RankedStream) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<li
			className={`overflow-hidden rounded-2xl border transition-colors ${
				tier.preferred
					? "border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
					: "border-line bg-surface/50 hover:border-white/12"
			}`}
		>
			<div className="group flex items-stretch">
				<button
					type="button"
					className="flex flex-1 items-center gap-4 p-3.5 text-left"
					onClick={() => onPlay(tier.best)}
					title={tier.best.facts.release ?? undefined}
				>
					<span
						className={`grid h-14 w-16 shrink-0 place-items-center rounded-xl font-display text-sm font-bold ${
							tier.preferred
								? "bg-(image:--gradient) text-white"
								: "bg-white/6 text-text/80"
						}`}
					>
						{tier.label}
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate font-display text-[1.02rem] font-semibold text-text">
							{releaseLine(tier.best)}
						</p>
						<Facts stream={tier.best} className="mt-1.5" />
					</div>
				</button>
				<button
					type="button"
					className="grid w-16 shrink-0 place-items-center text-muted transition-colors hover:text-text"
					onClick={() => onPlay(tier.best)}
					aria-label={`Play ${tier.label}`}
				>
					<span className="grid size-10 place-items-center rounded-full bg-white/7 transition-all group-hover:scale-105 group-hover:bg-(image:--gradient) group-hover:text-white">
						<Play className="size-4 translate-x-px fill-current" aria-hidden />
					</span>
				</button>
			</div>

			{tier.alternatives.length > 0 && (
				<>
					<button
						type="button"
						className="flex w-full items-center gap-1.5 border-t border-line/70 px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:bg-white/3 hover:text-text"
						onClick={() => setOpen((current) => !current)}
					>
						<ChevronDown
							className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
							aria-hidden
						/>
						{open
							? "Hide alternatives"
							: `${tier.alternatives.length} more in ${tier.label}`}
					</button>
					{open && (
						<ul className="max-h-80 divide-y divide-line/50 overflow-y-auto border-t border-line/70 bg-black/20">
							{tier.alternatives.map((stream) => (
								<li key={streamKey(stream)}>
									<button
										type="button"
										className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/4"
										onClick={() => onPlay(stream)}
										title={stream.facts.release ?? undefined}
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium text-text/90">
												{releaseLine(stream)}
											</p>
											<p className="truncate text-[0.7rem] text-muted/60">
												{stream.facts.release ?? stream.name}
											</p>
											<Facts stream={stream} className="mt-1" />
										</div>
										<Play
											className="size-3.5 shrink-0 fill-current text-muted"
											aria-hidden
										/>
									</button>
								</li>
							))}
						</ul>
					)}
				</>
			)}
		</li>
	);
}

/** One choice per quality instead of forty rows of the same film: the pick
 * we'd make is on top, everything else waits behind a disclosure. */
function StreamsSection({
	contentType,
	videoId,
	label,
	title,
	context,
}: {
	contentType: string;
	videoId: string;
	label?: string;
	title?: string;
	context?: PlayContext;
}) {
	const navigate = useNavigate();
	const [tiers, setTiers] = useState<StreamTier[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setTiers(null);
		setError(null);
		getStreamTiers(contentType, videoId)
			.then(setTiers)
			.catch((e) => setError(String(e)));
	}, [contentType, videoId]);

	const play = (stream: RankedStream) => {
		const state: PlayerLocationState = {
			stream,
			title: [title, label].filter(Boolean).join(" — "),
			context,
		};
		navigate("/player", { state });
	};

	return (
		<section className="streams">
			<header className="streams-header">
				<h2>Streams</h2>
				{label && <span className="streams-label">{label}</span>}
			</header>
			{error && <p className="row-note">{error}</p>}
			{tiers?.length === 0 && (
				<p className="row-note">
					None of your addons offered a stream for this. A stream addon like
					Torrentio usually helps.
				</p>
			)}
			{!tiers && !error && (
				<ul className="stream-list">
					{SKELETON_KEYS.map((key) => (
						<li key={key} className="stream-skeleton" />
					))}
				</ul>
			)}
			{tiers && tiers.length > 0 && (
				<ul className="flex flex-col gap-2.5">
					{/* The quality a single press of play opens leads the list. */}
					{[...tiers]
						.sort((a, b) => Number(b.preferred) - Number(a.preferred))
						.map((tier) => (
							<TierCard key={tier.quality} tier={tier} onPlay={play} />
						))}
				</ul>
			)}
		</section>
	);
}

export default StreamsSection;
