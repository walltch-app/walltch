import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { getProfile } from "./api";
import type { Profile } from "./bindings/Profile";

type ProfileContextValue = {
	profile: Profile | null;
	setProfile: (profile: Profile) => void;
};

const ProfileContext = createContext<ProfileContextValue>({
	profile: null,
	setProfile: () => {},
});

/** Loads the local profile once and shares it, so the topbar avatar and the
 * profile page stay in sync when either edits it. */
export function ProfileProvider({ children }: { children: ReactNode }) {
	const [profile, setProfile] = useState<Profile | null>(null);

	useEffect(() => {
		getProfile()
			.then(setProfile)
			.catch(() => {});
	}, []);

	const value = useMemo(() => ({ profile, setProfile }), [profile]);
	return (
		<ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
	);
}

export function useProfile() {
	return useContext(ProfileContext);
}

/** The monogram shown on an avatar without an image. */
export function avatarInitial(name: string) {
	return (name.trim()[0] ?? "W").toUpperCase();
}

/** Group the numeric friend code into readable halves ("12345678" → "1234 5678"). */
export function formatFriendCode(code: string) {
	return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}
