import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../lib/profile";
import AuthScreen from "./AuthScreen";
import ProfileSetup from "./ProfileSetup";
import "./auth.css";

/** Nothing in the app is reachable without an account and a set-up profile,
 * so the shell only renders once both are true. */
function Gate({ children }: { children: ReactNode }) {
	const { status } = useAuth();
	const { profile } = useProfile();

	// Session state hasn't come back yet.
	if (status === null) return <Splash />;
	if (!status.signedIn) return <AuthScreen />;
	// Signed in, but the profile is still on its way.
	if (profile === null) return <Splash />;
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

export default Gate;
