import { PanelRightClose, Users } from "lucide-react";
import { useState } from "react";

const STORAGE_KEY = "friend-rail";

/** Spotify-style friend activity panel on the home board's right edge.
 * There is no social backend yet, so it shows a friendly placeholder —
 * but the panel, its collapse behavior and its spot in the layout are
 * already the real thing. Collapsed state persists across sessions. */
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
		<aside className={open ? "home-rail" : "home-rail home-rail-min"}>
			{open ? (
				<div className="rail-card">
					<header>
						<Users aria-hidden className="rail-icon" />
						<h3>Friend Activity</h3>
						<button
							type="button"
							className="rail-collapse"
							onClick={toggle}
							aria-label="Hide friend activity"
							title="Hide friend activity"
						>
							<PanelRightClose aria-hidden />
						</button>
					</header>
					<div className="rail-empty">
						<p>No friend activity yet</p>
						<span>
							When your friends join Walltch, what they're watching will show up
							here.
						</span>
					</div>
				</div>
			) : (
				<button
					type="button"
					className="rail-reopen"
					onClick={toggle}
					aria-label="Show friend activity"
					title="Friend Activity"
				>
					<Users aria-hidden />
				</button>
			)}
		</aside>
	);
}

export default FriendRail;
