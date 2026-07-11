import { Check, Copy, UserPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
	addFriend,
	listContinueWatching,
	listFriends,
	listWatchlist,
	removeFriend,
	updateProfile,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Friend } from "../../lib/bindings/Friend";
import { avatarInitial, formatFriendCode, useProfile } from "../../lib/profile";
import AuthCard from "./AuthCard";
import "./profile.css";

const AVATAR_COLORS = [
	"#d0588a",
	"#0353f2",
	"#7c5cff",
	"#12b886",
	"#f76707",
	"#e64980",
	"#22b8cf",
	"#fab005",
];

function ProfilePage() {
	const { profile, setProfile } = useProfile();
	const { status } = useAuth();
	const signedIn = status?.signedIn ?? false;
	const [watching, setWatching] = useState(0);
	const [saved, setSaved] = useState(0);
	const [name, setName] = useState("");
	const [color, setColor] = useState(AVATAR_COLORS[0]);
	const [flash, setFlash] = useState(false);

	const [friends, setFriends] = useState<Friend[]>([]);
	const [codeInput, setCodeInput] = useState("");
	const [friendError, setFriendError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		listContinueWatching()
			.then((list) => setWatching(list.length))
			.catch(() => {});
		listWatchlist()
			.then((list) => setSaved(list.length))
			.catch(() => {});
	}, []);

	// Friends come from the server, so (re)load them whenever the session
	// changes rather than only on mount.
	useEffect(() => {
		if (!signedIn) {
			setFriends([]);
			return;
		}
		listFriends()
			.then(setFriends)
			.catch(() => {});
	}, [signedIn]);

	// Seed the form once the profile arrives (and after a save updates it).
	useEffect(() => {
		if (profile) {
			setName(profile.displayName);
			setColor(profile.avatarColor);
		}
	}, [profile]);

	if (!profile) return <div className="page" />;

	const dirty =
		name.trim() !== profile.displayName || color !== profile.avatarColor;

	async function save() {
		try {
			const next = await updateProfile({
				displayName: name,
				avatarColor: color,
			});
			setProfile(next);
			setFlash(true);
			setTimeout(() => setFlash(false), 1600);
		} catch {
			// Leave the form as-is; nothing was persisted.
		}
	}

	async function onAddFriend(e: FormEvent) {
		e.preventDefault();
		const code = codeInput.trim();
		if (!code) return;
		try {
			const friend = await addFriend(code);
			setFriends((current) => [friend, ...current]);
			setCodeInput("");
			setFriendError(null);
		} catch (err) {
			setFriendError(String(err));
		}
	}

	async function onRemoveFriend(id: string) {
		try {
			await removeFriend(id);
			setFriends((current) => current.filter((f) => f.id !== id));
		} catch {
			// Keep the row; the list reloads correctly next visit.
		}
	}

	function copyCode() {
		if (!profile) return;
		navigator.clipboard
			.writeText(profile.friendCode)
			.then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1600);
			})
			.catch(() => {});
	}

	return (
		<div className="page">
			<div className="profile-head">
				<div className="avatar avatar-big" style={{ background: color }}>
					<span>{avatarInitial(name || profile.displayName)}</span>
				</div>
				<div>
					<h1 className="page-title">{profile.displayName}</h1>
					<p className="page-subtitle">
						Friend code · {formatFriendCode(profile.friendCode)}
					</p>
				</div>
			</div>

			<div className="profile-stats">
				<div className="stat-card">
					<span className="stat-value">{watching}</span>
					<span className="stat-label">in progress</span>
				</div>
				<div className="stat-card">
					<span className="stat-value">{saved}</span>
					<span className="stat-label">in your list</span>
				</div>
			</div>

			<AuthCard />

			<section className="profile-edit">
				<h2 className="profile-section">Edit profile</h2>

				<label className="profile-field">
					<span className="profile-field-label">Display name</span>
					<input
						className="profile-input"
						value={name}
						onChange={(e) => setName(e.currentTarget.value)}
						maxLength={40}
						spellCheck={false}
					/>
				</label>

				<div className="profile-field">
					<span className="profile-field-label">Avatar color</span>
					<div className="swatch-row">
						{AVATAR_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								className={c === color ? "swatch swatch-on" : "swatch"}
								style={{ background: c }}
								onClick={() => setColor(c)}
								aria-label={`Avatar color ${c}`}
							>
								{c === color && <Check aria-hidden />}
							</button>
						))}
					</div>
				</div>

				<button type="button" className="btn" onClick={save} disabled={!dirty}>
					{flash ? "Saved" : "Save changes"}
				</button>
			</section>

			<section className="profile-friends">
				<h2 className="profile-section">Friends</h2>
				{signedIn ? (
					<>
						<p className="profile-hint">
							Share your code so friends can add you.
						</p>

						<div className="friend-code-box">
							<span className="friend-code">
								{formatFriendCode(profile.friendCode)}
							</span>
							<button type="button" className="copy-btn" onClick={copyCode}>
								<Copy aria-hidden />
								{copied ? "Copied" : "Copy"}
							</button>
						</div>

						<form className="add-friend" onSubmit={onAddFriend}>
							<input
								className="profile-input"
								value={codeInput}
								onChange={(e) => setCodeInput(e.currentTarget.value)}
								placeholder="Enter a friend code"
								inputMode="numeric"
								maxLength={8}
								spellCheck={false}
							/>
							<button type="submit" className="btn">
								<UserPlus aria-hidden />
								Add
							</button>
						</form>
						{friendError && <p className="form-error">{friendError}</p>}

						<ul className="friend-list">
							{friends.map((friend) => (
								<li key={friend.id} className="friend-row">
									<span
										className="avatar friend-avatar"
										style={{ background: friend.avatarColor }}
									>
										<span>{avatarInitial(friend.displayName)}</span>
									</span>
									<div className="friend-meta">
										<span className="friend-name">{friend.displayName}</span>
										<span className="friend-code-sub">
											{formatFriendCode(friend.friendCode)}
										</span>
									</div>
									<button
										type="button"
										className="friend-remove"
										onClick={() => onRemoveFriend(friend.id)}
										aria-label={`Remove ${friend.displayName}`}
									>
										<X aria-hidden />
									</button>
								</li>
							))}
							{friends.length === 0 && (
								<li className="friend-empty">No friends added yet.</li>
							)}
						</ul>
					</>
				) : (
					<p className="profile-hint">
						Sign in to get your friend code and add friends.
					</p>
				)}
			</section>
		</div>
	);
}

export default ProfilePage;
