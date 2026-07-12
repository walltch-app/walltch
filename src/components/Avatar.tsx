import { avatarUri } from "../lib/avatar";
import { avatarInitial } from "../lib/profile";

/** One avatar, wherever it appears: the picked mascot if there is one, the
 * monogram on a colour if there isn't (older accounts, or a friend who
 * hasn't chosen yet). Extra classes size it at each call site. */
function Avatar({
	name,
	avatar,
	color,
	className = "",
}: {
	name: string;
	avatar: string;
	color: string;
	className?: string;
}) {
	const classes = `avatar ${className}`.trim();

	if (avatar) {
		return (
			<span className={classes} style={{ background: color }}>
				<img src={avatarUri(avatar, color)} alt="" />
			</span>
		);
	}

	return (
		<span className={classes} style={{ background: color }}>
			<span>{avatarInitial(name)}</span>
		</span>
	);
}

export default Avatar;
