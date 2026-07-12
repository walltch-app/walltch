import { AnimatePresence, motion, type Transition } from "motion/react";
import {
	Children,
	cloneElement,
	type ReactElement,
	type ReactNode,
	useEffect,
	useId,
	useState,
} from "react";
import { cn } from "@/lib/utils";

/** Motion Primitives' AnimatedBackground: one highlight shared across a set of
 * items, which slides from the old one to the new via a layout transition
 * instead of appearing where you clicked. Each child needs a `data-id`. */

/** Each item identifies itself with `data-id`; the rest is what we hand back
 * to it when cloning — the shared highlight, its selected state, and the
 * click or hover that moves the highlight to it. */
type ItemProps = {
	"data-id": string;
	className?: string;
	children?: ReactNode;
	"data-checked"?: string;
	onClick?: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
};

type Item = ReactElement<ItemProps>;

export type AnimatedBackgroundProps = {
	children: Item[] | Item;
	defaultValue?: string;
	onValueChange?: (newActiveId: string | null) => void;
	className?: string;
	transition?: Transition;
	enableHover?: boolean;
};

export function AnimatedBackground({
	children,
	defaultValue,
	onValueChange,
	className,
	transition,
	enableHover = false,
}: AnimatedBackgroundProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const uniqueId = useId();

	const handleSetActiveId = (id: string | null) => {
		setActiveId(id);
		onValueChange?.(id);
	};

	useEffect(() => {
		if (defaultValue !== undefined) setActiveId(defaultValue);
	}, [defaultValue]);

	return Children.map(children, (child: Item) => {
		const id = child.props["data-id"];

		const interactionProps = enableHover
			? {
					onMouseEnter: () => handleSetActiveId(id),
					onMouseLeave: () => handleSetActiveId(null),
				}
			: {
					onClick: () => handleSetActiveId(id),
				};

		return cloneElement(
			child,
			{
				key: id,
				className: cn("relative inline-flex", child.props.className),
				"data-checked": activeId === id ? "true" : "false",
				...interactionProps,
			},
			<>
				<AnimatePresence initial={false}>
					{activeId === id && (
						<motion.div
							layoutId={`background-${uniqueId}`}
							className={cn("absolute inset-0", className)}
							transition={transition}
							initial={{ opacity: defaultValue ? 1 : 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
						/>
					)}
				</AnimatePresence>
				{/* Positioned, so it stacks above the highlight whatever the
				    item's display happens to be; full width, so a row can lay
				    itself out across the item rather than hug its text. */}
				<div className="relative z-10 w-full">{child.props.children}</div>
			</>,
		);
	});
}
