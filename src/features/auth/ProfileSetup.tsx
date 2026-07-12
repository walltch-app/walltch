import { type FormEvent, useState } from "react";
import WindowControls from "../../components/WindowControls";
import { updateProfile } from "../../lib/api";
import { AVATAR_SEEDS, avatarUri } from "../../lib/avatar";
import { AVATAR_COLORS, useProfile } from "../../lib/profile";
import "./auth.css";

/** Shown once, right after the first sign-in: pick a name and a mascot.
 * Saving the profile is what marks the account as set up. */
function ProfileSetup() {
	const { setProfile } = useProfile();
	const [name, setName] = useState("");
	const [pick, setPick] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// Each mascot comes with the colour it sits on, so one choice sets both.
	const seed = AVATAR_SEEDS[pick];
	const color = AVATAR_COLORS[pick % AVATAR_COLORS.length];

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		setBusy(true);
		setError(null);
		try {
			setProfile(
				await updateProfile({
					displayName: name,
					avatar: seed,
					avatarColor: color,
				}),
			);
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="gate">
			<header className="gate-bar" data-tauri-drag-region>
				<WindowControls />
			</header>

			<main className="gate-body">
				<div className="setup">
					<h1 className="gate-title">Who's watching?</h1>
					<p className="gate-lede">
						Pick a name and a mascot. This is how friends will see you.
					</p>

					<img
						className="setup-preview"
						src={avatarUri(seed, color)}
						alt=""
						style={{ background: color }}
					/>

					<form className="setup-form" onSubmit={submit}>
						<input
							className="profile-input setup-name"
							value={name}
							onChange={(e) => setName(e.currentTarget.value)}
							placeholder="Your name"
							maxLength={40}
							spellCheck={false}
							// biome-ignore lint/a11y/noAutofocus: the whole screen exists to fill this one field
							autoFocus
							required
						/>

						<div className="mascot-grid">
							{AVATAR_SEEDS.map((s, i) => {
								const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
								return (
									<button
										key={s}
										type="button"
										className={i === pick ? "mascot on" : "mascot"}
										style={{ background: c }}
										onClick={() => setPick(i)}
										aria-label={`Mascot ${i + 1}`}
									>
										<img src={avatarUri(s, c)} alt="" />
									</button>
								);
							})}
						</div>

						<button
							type="submit"
							className="btn gate-submit"
							disabled={busy || !name.trim()}
						>
							{busy ? "Saving…" : "Continue"}
						</button>
					</form>

					{error && <p className="form-error">{error}</p>}
				</div>
			</main>
		</div>
	);
}

export default ProfileSetup;
