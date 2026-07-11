import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import {
	listContinueWatching,
	listWatchlist,
	updateProfile,
} from "../../lib/api";
import { avatarInitial, formatFriendCode, useProfile } from "../../lib/profile";
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
	const [watching, setWatching] = useState(0);
	const [saved, setSaved] = useState(0);
	const [name, setName] = useState("");
	const [color, setColor] = useState(AVATAR_COLORS[0]);
	const [flash, setFlash] = useState(false);

	useEffect(() => {
		listContinueWatching()
			.then((list) => setWatching(list.length))
			.catch(() => {});
		listWatchlist()
			.then((list) => setSaved(list.length))
			.catch(() => {});
	}, []);

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
		</div>
	);
}

export default ProfilePage;
