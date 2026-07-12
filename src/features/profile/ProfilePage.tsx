import { Check, Copy, UserPlus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	acceptFriend,
	addFriend,
	listContinueWatching,
	listFriendRequests,
	listFriends,
	listWatchlist,
	rejectFriend,
	removeFriend,
	updateProfile,
} from "../../lib/api";
import type { Friend } from "../../lib/bindings/Friend";
import {
	AVATAR_COLORS,
	avatarInitial,
	formatFriendCode,
	useProfile,
} from "../../lib/profile";
import AuthCard from "./AuthCard";
import "./profile.css";

function ProfilePage() {
	const { profile, setProfile } = useProfile();
	const [watching, setWatching] = useState(0);
	const [saved, setSaved] = useState(0);
	const [name, setName] = useState("");
	const [color, setColor] = useState(AVATAR_COLORS[0]);
	const [flash, setFlash] = useState(false);

	const [friends, setFriends] = useState<Friend[]>([]);
	const [requests, setRequests] = useState<Friend[]>([]);
	const [codeInput, setCodeInput] = useState("");
	const [friendError, setFriendError] = useState<string | null>(null);
	const [friendNote, setFriendNote] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		listContinueWatching()
			.then((list) => setWatching(list.length))
			.catch(() => {});
		listWatchlist()
			.then((list) => setSaved(list.length))
			.catch(() => {});
	}, []);

	// Friends and incoming requests live on the server, so pull the truth
	// rather than trusting local edits.
	const reloadFriends = useCallback(() => {
		listFriends()
			.then(setFriends)
			.catch(() => {});
		listFriendRequests()
			.then(setRequests)
			.catch(() => {});
	}, []);

	// Poll, so a request you send or one a friend accepts shows up without
	// reopening the app.
	useEffect(() => {
		reloadFriends();
		const timer = setInterval(reloadFriends, 12000);
		return () => clearInterval(timer);
	}, [reloadFriends]);

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
			setCodeInput("");
			setFriendError(null);
			setFriendNote(`Request sent to ${friend.displayName}.`);
		} catch (err) {
			setFriendNote(null);
			setFriendError(String(err));
		}
	}

	async function onAcceptRequest(id: string) {
		try {
			await acceptFriend(id);
		} finally {
			reloadFriends();
		}
	}

	async function onRejectRequest(id: string) {
		try {
			await rejectFriend(id);
		} finally {
			reloadFriends();
		}
	}

	async function onRemoveFriend(id: string) {
		try {
			await removeFriend(id);
		} finally {
			reloadFriends();
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
				<p className="profile-hint">Share your code so friends can add you.</p>

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
				{friendNote && <p className="auth-note">{friendNote}</p>}

				{requests.length > 0 && (
					<div className="friend-requests">
						<h3 className="friend-subhead">Requests</h3>
						<ul className="friend-list">
							{requests.map((req) => (
								<li key={req.id} className="friend-row">
									<span
										className="avatar friend-avatar"
										style={{ background: req.avatarColor }}
									>
										<span>{avatarInitial(req.displayName)}</span>
									</span>
									<div className="friend-meta">
										<span className="friend-name">{req.displayName}</span>
										<span className="friend-code-sub">wants to be friends</span>
									</div>
									<button
										type="button"
										className="req-accept"
										onClick={() => onAcceptRequest(req.id)}
										aria-label={`Accept ${req.displayName}`}
									>
										<Check aria-hidden />
									</button>
									<button
										type="button"
										className="friend-remove"
										onClick={() => onRejectRequest(req.id)}
										aria-label={`Reject ${req.displayName}`}
									>
										<X aria-hidden />
									</button>
								</li>
							))}
						</ul>
					</div>
				)}

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
			</section>
		</div>
	);
}

export default ProfilePage;
