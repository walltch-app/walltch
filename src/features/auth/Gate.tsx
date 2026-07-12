import type { ReactNode } from "react";
import WindowControls from "../../components/WindowControls";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../lib/profile";
import AuthScreen from "./AuthScreen";
import ProfileSetup from "./ProfileSetup";
import "./auth.css";

/** Nothing in the app is reachable without an account and a set-up profile,
 * so the shell only renders once both are true. */
function Gate({ children }: { children: ReactNode }) {
	const { status } = useAuth();
	const { profile, error, reload } = useProfile();

	// Session state hasn't come back yet.
	if (status === null) return <Splash />;
	if (!status.signedIn) return <AuthScreen />;
	// Signed in, but the profile didn't load — say so instead of spinning
	// on the splash forever.
	if (profile === null)
		return error ? (
			<ProfileError message={error} onRetry={reload} />
		) : (
			<Splash />
		);
	if (!profile.onboarded) return <ProfileSetup />;

	return <>{children}</>;
}

function Splash() {
	return (
		<div className="gate">
			<div className="gate-splash">
				<img src="/logo.png" alt="" />
			</div>
		</div>
	);
}

function ProfileError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	const { signOut } = useAuth();
	return (
		<div className="gate">
			<div className="gate-bar" data-tauri-drag-region>
				<WindowControls />
			</div>
			<div className="gate-body">
				<div className="gate-card">
					<div className="gate-brand">
						<img src="/logo.png" alt="" />
						<span>Walltch</span>
					</div>
					<h1 className="gate-title">Couldn't load your profile</h1>
					<p className="gate-lede">{message}</p>
					<button
						type="button"
						className="primary gate-submit"
						onClick={onRetry}
					>
						Try again
					</button>
					<button type="button" className="auth-toggle" onClick={signOut}>
						Sign out
					</button>
				</div>
			</div>
		</div>
	);
}

export default Gate;
