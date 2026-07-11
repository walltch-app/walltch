import { LogOut } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../lib/auth";

/** Google's multi-color "G", inline so it needs no network. */
function GoogleMark() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 48 48"
			role="img"
			aria-label="Google"
		>
			<path
				fill="#EA4335"
				d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
			/>
			<path
				fill="#4285F4"
				d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
			/>
			<path
				fill="#FBBC05"
				d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
			/>
			<path
				fill="#34A853"
				d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
			/>
		</svg>
	);
}

/** Email sign-in / sign-up card. Signed in, it shows the account and a way
 * out. This is the account layer friends and cross-device sync ride on. */
function AuthCard() {
	const { status, signIn, signUp, signInWithGoogle, signOut } = useAuth();
	const [mode, setMode] = useState<"in" | "up">("in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function onGoogle() {
		setError(null);
		setNote("Continue in your browser, then come back…");
		setBusy(true);
		try {
			await signInWithGoogle();
			setNote(null);
		} catch (err) {
			setNote(null);
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

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
			<button
				type="button"
				className="google-btn"
				onClick={onGoogle}
				disabled={busy}
			>
				<GoogleMark />
				Continue with Google
			</button>
			<div className="auth-divider">
				<span>or</span>
			</div>
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
