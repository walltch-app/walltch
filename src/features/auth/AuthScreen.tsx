import { type FormEvent, useState } from "react";
import WindowControls from "../../components/WindowControls";
import { useAuth } from "../../lib/auth";
import GoogleMark from "./GoogleMark";
import "./auth.css";

/** The gate: nothing in the app is reachable without an account, so this
 * replaces the whole shell until you're signed in. */
function AuthScreen() {
	const { signIn, signUp, signInWithGoogle } = useAuth();
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
		} catch (err) {
			setError(String(err));
		} finally {
			setNote(null);
			setBusy(false);
		}
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
		<div className="gate">
			<header className="gate-bar" data-tauri-drag-region>
				<WindowControls />
			</header>

			<main className="gate-body">
				<div className="gate-card">
					<div className="gate-brand">
						<img src="/logo.png" alt="" />
						<span>Walltch</span>
					</div>
					<h1 className="gate-title">
						{mode === "in" ? "Welcome back" : "Create your account"}
					</h1>
					<p className="gate-lede">
						Your library, your friends, and what you're watching — on every
						device you sign in from.
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
						<button type="submit" className="btn gate-submit" disabled={busy}>
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
				</div>
			</main>
		</div>
	);
}

export default AuthScreen;
