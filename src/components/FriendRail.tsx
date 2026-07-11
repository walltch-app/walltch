import { PanelRightClose, Users } from "lucide-react";
import { useState } from "react";

const STORAGE_KEY = "friend-rail";

/** Spotify-style friend activity rail: global chrome docked to the right
 * edge, full height, alongside the sidebar and main content. There is no
 * social backend yet, so it shows a placeholder — but the panel, its
 * collapse behavior and its place in the shell are already the real
 * thing. The panel stays mounted and animates its width both ways;
 * collapsed state persists across sessions. */
function FriendRail() {
	const [open, setOpen] = useState(
		() => localStorage.getItem(STORAGE_KEY) !== "closed",
	);

	const toggle = () => {
		const next = !open;
		setOpen(next);
		localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
	};

	return (
		<aside className={open ? "friend-rail" : "friend-rail friend-rail-min"}>
			<div className="friend-rail-inner">
				<header>
					<Users aria-hidden className="friend-rail-icon" />
					<h3>Friend Activity</h3>
					<button
						type="button"
						className="friend-rail-collapse"
						onClick={toggle}
						aria-label="Hide friend activity"
						title="Hide friend activity"
						tabIndex={open ? 0 : -1}
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
			</div>
			<button
				type="button"
				className="friend-rail-expand"
				onClick={toggle}
				aria-label="Show friend activity"
				title="Friend Activity"
				tabIndex={open ? -1 : 0}
			>
				<Users aria-hidden />
			</button>
		</aside>
	);
}

export default FriendRail;
