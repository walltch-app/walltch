import { LogOut } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../lib/auth";

/** Email sign-in / sign-up card. Signed in, it shows the account and a way
 * out. This is the account layer friends and cross-device sync ride on. */
function AuthCard() {
	const { status, signIn, signUp, signOut } = useAuth();
	const [mode, setMode] = useState<"in" | "up">("in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	if (status?.signedIn) {
		return (
			<section className="auth-card auth-in">
				<div className="auth-in-meta">
					<span className="auth-in-label">Signed in</span>
					<span className="auth-in-email">{status.email}</span>
				</div>
				<button type="button" className="copy-btn" onClick={() => signOut()}>
					<LogOut aria-hidden />
					Sign out
				</button>
			</section>
		);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setNote(null);
		setBusy(true);
		try {
			if (mode === "up") {
				const res = await signUp(email, password);
				if (!res.signedIn && res.needsConfirmation) {
					setNote("Account created. Confirm your email, then sign in.");
					setMode("in");
				}
			} else {
				await signIn(email, password);
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="auth-card">
			<h2 className="profile-section">
				{mode === "in" ? "Sign in" : "Create account"}
			</h2>
			<p className="profile-hint">
				Sign in to connect with friends and sync across your devices.
			</p>
			<form className="auth-form" onSubmit={submit}>
				<input
					className="profile-input"
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.currentTarget.value)}
					autoComplete="email"
					required
				/>
				<input
					className="profile-input"
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.currentTarget.value)}
					autoComplete={mode === "in" ? "current-password" : "new-password"}
					minLength={6}
					required
				/>
				<button type="submit" className="btn" disabled={busy}>
					{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
				</button>
			</form>
			{error && <p className="form-error">{error}</p>}
			{note && <p className="auth-note">{note}</p>}
			<button
				type="button"
				className="auth-toggle"
				onClick={() => {
					setMode(mode === "in" ? "up" : "in");
					setError(null);
					setNote(null);
				}}
			>
				{mode === "in"
					? "Need an account? Create one"
					: "Have an account? Sign in"}
			</button>
		</section>
	);
}

export default AuthCard;
