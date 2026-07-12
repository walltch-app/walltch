import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { getProfile } from "./api";
import { useAuth } from "./auth";
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
	const { status } = useAuth();
	const [profile, setProfile] = useState<Profile | null>(null);

	// The profile is the account, so it only exists while signed in.
	const signedIn = status?.signedIn ?? false;
	useEffect(() => {
		if (!signedIn) {
			setProfile(null);
			return;
		}
		getProfile()
			.then(setProfile)
			.catch(() => {});
	}, [signedIn]);

	const value = useMemo(() => ({ profile, setProfile }), [profile]);
	return (
		<ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
	);
}

export function useProfile() {
	return useContext(ProfileContext);
}

/** The palette avatars are picked from, on setup and later in settings. */
export const AVATAR_COLORS = [
	"#d0588a",
	"#0353f2",
	"#7c5cff",
	"#12b886",
	"#f76707",
	"#e64980",
	"#22b8cf",
	"#fab005",
	"#ff6b6b",
	"#20c997",
	"#845ef7",
	"#f06595",
];

/** The monogram shown on an avatar without an image. */
export function avatarInitial(name: string) {
	return (name.trim()[0] ?? "W").toUpperCase();
}

/** Group the numeric friend code into readable halves ("12345678" → "1234 5678"). */
export function formatFriendCode(code: string) {
	return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}
