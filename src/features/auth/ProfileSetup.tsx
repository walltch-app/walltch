import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import WindowControls from "../../components/WindowControls";
import { updateProfile } from "../../lib/api";
import { AVATAR_COLORS, avatarInitial, useProfile } from "../../lib/profile";
import "./auth.css";

/** Shown once, right after the first sign-in: pick a name and an avatar.
 * Saving the profile is what marks the account as set up. */
function ProfileSetup() {
	const { profile, setProfile } = useProfile();
	const [name, setName] = useState("");
	const [color, setColor] = useState(AVATAR_COLORS[0]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		setBusy(true);
		setError(null);
		try {
			setProfile(
				await updateProfile({ displayName: name, avatarColor: color }),
			);
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

	const preview = avatarInitial(name || profile?.displayName || "W");

	return (
		<div className="gate">
			<header className="gate-bar" data-tauri-drag-region>
				<WindowControls />
			</header>

			<main className="gate-body">
				<div className="setup">
					<h1 className="gate-title">Who's watching?</h1>
					<p className="gate-lede">
						Pick a name and an avatar. This is how friends will see you.
					</p>

					<div className="setup-preview" style={{ background: color }}>
						<span>{preview}</span>
					</div>

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

						<div className="setup-colors">
							{AVATAR_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									className={c === color ? "setup-swatch on" : "setup-swatch"}
									style={{ background: c }}
									onClick={() => setColor(c)}
									aria-label={`Avatar color ${c}`}
								>
									{c === color && <Check aria-hidden />}
								</button>
							))}
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
