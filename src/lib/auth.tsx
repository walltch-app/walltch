import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	signIn as apiSignIn,
	signOut as apiSignOut,
	signUp as apiSignUp,
	authStatus,
} from "./api";
import type { AuthStatus } from "./bindings/AuthStatus";

type AuthContextValue = {
	status: AuthStatus | null;
	signIn: (email: string, password: string) => Promise<AuthStatus>;
	signUp: (email: string, password: string) => Promise<AuthStatus>;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
	status: null,
	signIn: async () => {
		throw new Error("auth not ready");
	},
	signUp: async () => {
		throw new Error("auth not ready");
	},
	signOut: async () => {},
});

/** Loads the Supabase session state once and shares it. Mutating calls
 * (sign in/up/out) update the shared status so the whole app reacts. */
export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus | null>(null);

	useEffect(() => {
		authStatus()
			.then(setStatus)
			.catch(() => {});
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			status,
			signIn: async (email, password) => {
				const next = await apiSignIn(email, password);
				setStatus(next);
				return next;
			},
			signUp: async (email, password) => {
				const next = await apiSignUp(email, password);
				// A confirmation-needed result isn't a signed-in session; only
				// reflect it as status when we're actually in.
				if (next.signedIn) setStatus(next);
				return next;
			},
			signOut: async () => {
				await apiSignOut();
				setStatus({ signedIn: false, email: null, needsConfirmation: false });
			},
		}),
		[status],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	return useContext(AuthContext);
}
