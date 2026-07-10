import { PanelRightClose, Users } from "lucide-react";
import { useState } from "react";

const STORAGE_KEY = "friend-rail";

/** Spotify-style friend activity rail: global chrome docked to the right
 * edge, full height, alongside the sidebar and main content. There is no
 * social backend yet, so it shows a placeholder — but the panel, its
 * collapse behavior and its place in the shell are already the real
 * thing. Collapsed state persists across sessions. */
function FriendRail() {
	const [open, setOpen] = useState(
		() => localStorage.getItem(STORAGE_KEY) !== "closed",
	);

	const toggle = () => {
		const next = !open;
		setOpen(next);
		localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
	};

	if (!open) {
		return (
			<button
				type="button"
				className="friend-rail-reopen"
				onClick={toggle}
				aria-label="Show friend activity"
				title="Friend Activity"
			>
				<Users aria-hidden />
			</button>
		);
	}

	return (
		<aside className="friend-rail">
			<header>
				<Users aria-hidden className="friend-rail-icon" />
				<h3>Friend Activity</h3>
				<button
					type="button"
					className="friend-rail-collapse"
					onClick={toggle}
					aria-label="Hide friend activity"
					title="Hide friend activity"
				>
					<PanelRightClose aria-hidden />
				</button>
			</header>
			<div className="friend-rail-empty">
				<p>No friend activity yet</p>
				<span>
					When your friends join Walltch, what they're watching will show up
					here.
				</span>
			</div>
		</aside>
	);
}

export default FriendRail;
