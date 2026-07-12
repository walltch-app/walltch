import { LogOut } from "lucide-react";
import { useAuth } from "../../lib/auth";

/** The account row on the profile page. Signing out drops you back to the
 * gate, so there's no signed-out variant of this. */
function AuthCard() {
	const { status, signOut } = useAuth();
	if (!status?.signedIn) return null;

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

export default AuthCard;
