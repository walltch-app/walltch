import { bottts } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";

// The mascots people choose from. Each seed is a distinct robot, paired
// with the background it sits on — so picking one sets both fields.
// Art: Bottts by Pablo Stanley, free for personal and commercial use.
export const AVATAR_SEEDS = [
	"Aneka",
	"Bandit",
	"Cleo",
	"Dusty",
	"Echo",
	"Fig",
	"Gizmo",
	"Hopper",
	"Iris",
	"Jinx",
	"Koda",
	"Luna",
];

/** Generated locally, so avatars work offline and render identically on a
 * friend's machine. Cached because the same few are drawn constantly. */
const cache = new Map<string, string>();

export function avatarUri(seed: string, background: string) {
	const key = `${seed}|${background}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const uri = createAvatar(bottts, {
		seed,
		backgroundColor: [background.replace("#", "")],
		radius: 50,
	}).toDataUri();
	cache.set(key, uri);
	return uri;
}
