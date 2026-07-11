import { Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getMeta } from "../lib/api";
import type { WatchProgress } from "../lib/bindings/WatchProgress";

/** A continue-watching card: landscape art with a progress bar, like the
 * mock. Used on home and in the library. */
export function ContinueCard({
	entry,
	onRemove,
}: {
	entry: WatchProgress;
	onRemove?: () => void;
}) {
	const percent = Math.round(
		(entry.positionSecs / Math.max(entry.durationSecs, 1)) * 100,
	);
	const episode = entry.videoId.startsWith(`${entry.metaId}:`)
		? entry.videoId.slice(entry.metaId.length + 1).replace(":", "×")
		: null;

	// The frame is landscape, so a backdrop fits where a portrait poster gets
	// cropped. New entries store one; entries saved before we did fetch it on
	// demand, falling back to the poster if the addon has no backdrop.
	const [art, setArt] = useState<string | null>(
		entry.background ?? entry.poster,
	);
	useEffect(() => {
		if (entry.background) {
			setArt(entry.background);
			return;
		}
		let stale = false;
		getMeta(entry.type, entry.metaId)
			.then((meta) => {
				if (!stale) setArt(meta.background ?? entry.poster);
			})
			.catch(() => {});
		return () => {
			stale = true;
		};
	}, [entry.background, entry.poster, entry.type, entry.metaId]);

	return (
		<div className="continue-card">
			<Link
				to={`/detail/${entry.type}/${encodeURIComponent(entry.metaId)}`}
				className="continue-link"
			>
				<div className="continue-art">
					{art ? (
						<img src={art} alt="" loading="lazy" />
					) : (
						<div className="poster-fallback" aria-hidden>
							{entry.name.slice(0, 1)}
						</div>
					)}
					<div className="continue-play" aria-hidden>
						<span className="continue-play-badge">
							<Play />
						</span>
					</div>
					<div className="continue-bar" aria-hidden>
						<div style={{ width: `${percent}%` }} />
					</div>
				</div>
				<span className="poster-name">{entry.name}</span>
				<span className="poster-year">
					{episode ? `Episode ${episode} · ` : ""}
					{percent}% watched
				</span>
			</Link>
			{onRemove && (
				<button
					type="button"
					className="continue-remove"
					onClick={onRemove}
					aria-label={`Remove ${entry.name} from continue watching`}
				>
					<X aria-hidden />
				</button>
			)}
		</div>
	);
}
