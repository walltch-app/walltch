import { X } from "lucide-react";
import { Link } from "react-router";
import type { WatchProgress } from "../lib/bindings/WatchProgress";

/** A continue-watching poster with progress bar; used on home and library. */
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

	return (
		<div className="continue-card">
			<Link
				to={`/detail/${entry.type}/${encodeURIComponent(entry.metaId)}`}
				className="continue-link"
			>
				{entry.poster ? (
					<img src={entry.poster} alt="" loading="lazy" />
				) : (
					<div className="poster-fallback" aria-hidden>
						{entry.name.slice(0, 1)}
					</div>
				)}
				<div className="continue-bar" aria-hidden>
					<div style={{ width: `${percent}%` }} />
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
