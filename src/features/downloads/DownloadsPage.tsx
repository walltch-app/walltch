import { HardDrive, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteDownload, listDownloads } from "../../lib/api";
import type { DownloadEntry } from "../../lib/bindings/DownloadEntry";
import "./downloads.css";

function formatBytes(bytes: number) {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The torrent cache, visible: what's on disk and how big it is. */
function DownloadsPage() {
	const [entries, setEntries] = useState<DownloadEntry[] | null>(null);

	const refresh = useCallback(() => {
		listDownloads()
			.then(setEntries)
			.catch(() => setEntries([]));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const total = entries?.reduce((sum, e) => sum + Number(e.sizeBytes), 0) ?? 0;

	return (
		<div className="page">
			<h1 className="page-title">Downloads</h1>
			<p className="page-subtitle">
				Streams cached while watching.
				{entries && entries.length > 0 && ` ${formatBytes(total)} in total.`}
			</p>

			{entries?.length === 0 && (
				<div className="empty">
					<h2>Nothing here yet</h2>
					<p>
						With the keep-downloads cache mode, everything you watch piles up
						here and rewatching starts instantly.
					</p>
				</div>
			)}

			{entries && entries.length > 0 && (
				<ul className="download-list">
					{entries.map((entry) => (
						<li key={entry.name} className="download-row">
							<HardDrive aria-hidden />
							<span className="download-name">{entry.name}</span>
							<span className="download-size">
								{formatBytes(Number(entry.sizeBytes))}
							</span>
							<button
								type="button"
								className="btn-remove"
								onClick={async () => {
									await deleteDownload(entry.name).catch(() => {});
									refresh();
								}}
							>
								<Trash2 aria-hidden />
								Delete
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default DownloadsPage;
