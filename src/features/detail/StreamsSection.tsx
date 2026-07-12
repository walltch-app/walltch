import { Check, HardDrive, Play, TriangleAlert, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getStreamTiers } from "@/lib/api";
import type { Quality } from "@/lib/bindings/Quality";
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

/** The release, as tags: WEB-DL, HDR, H.265, Atmos. */
function tagsOf(stream: RankedStream): string[] {
	const { source, codec, audio, hdr } = stream.facts;
	return [source, hdr ? "HDR" : null, codec, audio].filter(
		(tag): tag is string => Boolean(tag),
	);
}

function Tag({ children, strong }: { children: string; strong?: boolean }) {
	return (
		<span
			className={`rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold tracking-wide ${
				strong ? "bg-(image:--gradient) text-white" : "bg-white/8 text-text/75"
			}`}
		>
			{children}
		</span>
	);
}

function Stats({ stream }: { stream: RankedStream }) {
	const size = formatSize(stream.facts.sizeBytes);
	return (
		<div className="flex items-center gap-3 text-xs text-muted tabular-nums">
			{stream.facts.seeders !== null && (
				<span className="inline-flex items-center gap-1">
					<Users className="size-3.5" aria-hidden />
					{stream.facts.seeders}
				</span>
			)}
			{size && (
				<span className="inline-flex items-center gap-1">
					<HardDrive className="size-3.5" aria-hidden />
					{size}
				</span>
			)}
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

/** The stream we'd choose in this quality: big, tagged, one press away. */
function BestCard({
	stream,
	label,
	onPlay,
}: {
	stream: RankedStream;
	label: string;
	onPlay: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPlay}
			title={stream.facts.release ?? undefined}
			className="group flex w-full items-center gap-5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-5 text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
		>
			<span className="grid size-14 shrink-0 place-items-center rounded-full bg-(image:--gradient) text-white shadow-lg shadow-black/40 transition-transform group-hover:scale-105">
				<Play className="size-5 translate-x-0.5 fill-current" aria-hidden />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 text-xs font-semibold text-muted">
					<Check className="size-3.5" aria-hidden />
					Best in {label}
				</div>
				<div className="mt-2 flex flex-wrap items-center gap-1.5">
					<Tag strong>{label}</Tag>
					{tagsOf(stream).map((tag) => (
						<Tag key={tag}>{tag}</Tag>
					))}
				</div>
				<div className="mt-2.5">
					<Stats stream={stream} />
				</div>
			</div>
		</button>
	);
}

function OptionRow({
	stream,
	onPlay,
}: {
	stream: RankedStream;
	onPlay: () => void;
}) {
	return (
		<li>
			<button
				type="button"
				onClick={onPlay}
				title={stream.facts.release ?? undefined}
				className="group flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/5"
			>
				<span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/6 text-muted transition-colors group-hover:bg-(image:--gradient) group-hover:text-white">
					<Play className="size-3.5 translate-x-px fill-current" aria-hidden />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						{tagsOf(stream).map((tag) => (
							<Tag key={tag}>{tag}</Tag>
						))}
					</div>
					<p className="mt-1.5 truncate text-[0.72rem] text-muted/60">
						{stream.facts.release ?? stream.name}
					</p>
				</div>
				<div className="shrink-0">
					<Stats stream={stream} />
				</div>
			</button>
		</li>
	);
}

/** Pick a quality, get the stream we'd choose in it, and only then — if you
 * care — the rest. No wall of release names. */
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
	const [active, setActive] = useState<Quality | null>(null);

	useEffect(() => {
		setTiers(null);
		setError(null);
		setActive(null);
		getStreamTiers(contentType, videoId)
			.then(setTiers)
			.catch((e) => setError(String(e)));
	}, [contentType, videoId]);

	// Open on the quality settings ask for; the user can move off it.
	const tier = useMemo(() => {
		if (!tiers || tiers.length === 0) return null;
		if (active) return tiers.find((t) => t.quality === active) ?? tiers[0];
		return tiers.find((t) => t.preferred) ?? tiers[0];
	}, [tiers, active]);

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

			{tiers && tier && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap gap-1.5 rounded-full border border-line bg-surface/60 p-1 self-start">
						{tiers.map((option) => (
							<button
								key={option.quality}
								type="button"
								onClick={() => setActive(option.quality)}
								className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
									option.quality === tier.quality
										? "bg-(image:--gradient) text-white"
										: "text-muted hover:text-text"
								}`}
							>
								{option.label}
								<span className="ml-1.5 text-xs font-normal opacity-70">
									{option.alternatives.length + 1}
								</span>
							</button>
						))}
					</div>

					<BestCard
						stream={tier.best}
						label={tier.label}
						onPlay={() => play(tier.best)}
					/>

					{tier.alternatives.length > 0 && (
						<div>
							<p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">
								Other {tier.label} releases
							</p>
							<ul className="max-h-96 list-none overflow-y-auto pr-1">
								{tier.alternatives.map((stream) => (
									<OptionRow
										key={streamKey(stream)}
										stream={stream}
										onPlay={() => play(stream)}
									/>
								))}
							</ul>
						</div>
					)}
				</div>
			)}
		</section>
	);
}

export default StreamsSection;
