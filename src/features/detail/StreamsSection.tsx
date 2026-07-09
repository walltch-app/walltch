import { useEffect, useState } from "react";
import { getStreams } from "../../lib/api";
import type { AddonStream } from "../../lib/bindings/AddonStream";

const SKELETON_KEYS = ["a", "b", "c", "d"];

// Streams carry no id; the source itself is the most stable key we have.
function streamKey(stream: AddonStream): string {
	if ("url" in stream) return `${stream.addonName}|${stream.url}`;
	if ("infoHash" in stream) {
		return `${stream.addonName}|${stream.infoHash}:${stream.fileIdx ?? ""}`;
	}
	if ("ytId" in stream) return `${stream.addonName}|yt:${stream.ytId}`;
	return `${stream.addonName}|${stream.externalUrl}`;
}

function StreamsSection({
	contentType,
	videoId,
	label,
}: {
	contentType: string;
	videoId: string;
	label?: string;
}) {
	const [streams, setStreams] = useState<AddonStream[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setStreams(null);
		setError(null);
		getStreams(contentType, videoId)
			.then(setStreams)
			.catch((e) => setError(String(e)));
	}, [contentType, videoId]);

	return (
		<section className="streams">
			<header className="streams-header">
				<h2>Streams</h2>
				{label && <span className="streams-label">{label}</span>}
			</header>
			{error && <p className="row-note">{error}</p>}
			{streams?.length === 0 && (
				<p className="row-note">
					None of your addons offered a stream for this. A stream addon like
					Torrentio usually helps.
				</p>
			)}
			{!streams && !error && (
				<ul className="stream-list">
					{SKELETON_KEYS.map((key) => (
						<li key={key} className="stream-skeleton" />
					))}
				</ul>
			)}
			{streams && streams.length > 0 && (
				<ul className="stream-list">
					{streams.map((stream) => (
						<li key={streamKey(stream)} className="stream-row">
							<span className="stream-addon">{stream.addonName}</span>
							<div className="stream-info">
								{stream.name && (
									<span className="stream-name">{stream.name}</span>
								)}
								<span className="stream-desc">
									{stream.description ?? stream.title ?? "Stream"}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export default StreamsSection;
