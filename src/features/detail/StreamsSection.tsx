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

/** The line under a release: swarm, size, and who served it. */
function Facts({ stream }: { stream: RankedStream }) {
	const { seeders, sizeBytes, hdr, webPlayable } = stream.facts;
	const size = formatSize(sizeBytes);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
			{seeders !== null && (
				<span className="inline-flex items-center gap-1">
					<Users className="size-3.5" aria-hidden />
					{seeders}
				</span>
			)}
			{size && <span>{size}</span>}
			<span>{stream.addonName}</span>
			{hdr && (
				<span className="rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide">
					HDR
				</span>
			)}
			{!webPlayable && (
				<span
					className="inline-flex items-center gap-1 text-amber-400/80"
					title="This codec doesn't play in the built-in player yet"
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
		<li className="overflow-hidden rounded-2xl border border-line bg-surface/70">
			<div className="flex items-center gap-4 p-4">
				<span className="w-16 shrink-0 text-center font-display text-lg font-bold">
					{tier.label}
				</span>
				<div className="min-w-0 flex-1">
					<p className="truncate text-[0.95rem] font-medium text-text">
						{tier.best.facts.release ?? tier.best.name ?? "Stream"}
					</p>
					<Facts stream={tier.best} />
				</div>
				<button
					type="button"
					className="primary inline-flex shrink-0 items-center gap-2"
					onClick={() => onPlay(tier.best)}
				>
					<Play className="size-4 fill-current" aria-hidden />
					Play
				</button>
			</div>

			{tier.alternatives.length > 0 && (
				<div className="border-t border-line">
					<button
						type="button"
						className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:text-text"
						onClick={() => setOpen((current) => !current)}
					>
						<ChevronDown
							className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
							aria-hidden
						/>
						{open
							? "Hide"
							: `${tier.alternatives.length} more in ${tier.label}`}
					</button>
					{open && (
						<ul className="px-2 pb-2">
							{tier.alternatives.map((stream) => (
								<li key={streamKey(stream)}>
									<button
										type="button"
										className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
										onClick={() => onPlay(stream)}
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm text-text/90">
												{stream.facts.release ?? stream.name ?? "Stream"}
											</p>
											<Facts stream={stream} />
										</div>
										<Play className="size-4 shrink-0 text-muted" aria-hidden />
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
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
				<ul className="flex flex-col gap-3">
					{tiers.map((tier) => (
						<TierCard key={tier.quality} tier={tier} onPlay={play} />
					))}
				</ul>
			)}
		</section>
	);
}

export default StreamsSection;
