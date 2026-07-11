import { PanelRightClose, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { friendActivity, listFriends } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Friend } from "../lib/bindings/Friend";
import type { FriendActivity } from "../lib/bindings/FriendActivity";
import { avatarInitial } from "../lib/profile";

const STORAGE_KEY = "friend-rail";

/** "now" while fresh, then "3m ago" / "2h ago" / "4d ago". */
function relativeTime(iso: string) {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const minutes = Math.floor((Date.now() - then) / 60000);
	if (minutes < 2) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

/** Spotify-style friend activity rail: global chrome docked to the right
 * edge, full height, alongside the sidebar and main content. Lists the
 * friends you've added and their latest activity; live activity is empty
 * until a social server lands, so friends read as idle for now. Collapsed
 * state persists across sessions. */
function FriendRail() {
	const { status } = useAuth();
	const signedIn = status?.signedIn ?? false;
	const [open, setOpen] = useState(
		() => localStorage.getItem(STORAGE_KEY) !== "closed",
	);
	const [friends, setFriends] = useState<Friend[]>([]);
	const [activity, setActivity] = useState<FriendActivity[]>([]);

	// Reload on session change, then poll, so newly accepted friends and
	// their activity appear without reopening the app.
	useEffect(() => {
		if (!signedIn) {
			setFriends([]);
			setActivity([]);
			return;
		}
		const load = () => {
			listFriends()
				.then(setFriends)
				.catch(() => {});
			friendActivity()
				.then(setActivity)
				.catch(() => {});
		};
		load();
		const timer = setInterval(load, 12000);
		return () => clearInterval(timer);
	}, [signedIn]);

	const toggle = () => {
		const next = !open;
		setOpen(next);
		localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
	};

	// Newest activity per friend, so each friend shows one current line.
	const latest = new Map<string, FriendActivity>();
	for (const item of activity) {
		if (!latest.has(item.friendId)) latest.set(item.friendId, item);
	}

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

				{friends.length === 0 ? (
					<div className="friend-rail-empty">
						<p>No friends yet</p>
						<span>
							Add a friend by their code on your profile, and what they're
							watching will show up here.
						</span>
					</div>
				) : (
					<ul className="friend-rail-list">
						{friends.map((friend) => {
							const now = latest.get(friend.id);
							return (
								<li key={friend.id} className="friend-rail-item">
									<span
										className="avatar friend-rail-avatar"
										style={{ background: friend.avatarColor }}
									>
										<span>{avatarInitial(friend.displayName)}</span>
									</span>
									<div className="friend-rail-meta">
										<span className="friend-rail-name">
											{friend.displayName}
										</span>
										<span className="friend-rail-sub">
											{now
												? now.subtitle
													? `${now.title} · ${now.subtitle}`
													: now.title
												: "Not watching right now"}
										</span>
									</div>
									{now && (
										<span className="friend-rail-time">
											{relativeTime(now.updatedAt)}
										</span>
									)}
								</li>
							);
						})}
					</ul>
				)}
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
