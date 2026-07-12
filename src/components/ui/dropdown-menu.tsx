import { DropdownMenu as Primitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Radix's dropdown (keyboard nav, focus return, outside dismissal), dressed
 * in Walltch's tokens instead of shadcn's default palette. Trimmed to the
 * parts we actually use — checkbox and radio items can come back from the
 * registry the day something needs them. */

function DropdownMenu(props: React.ComponentProps<typeof Primitive.Root>) {
	return <Primitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(
	props: React.ComponentProps<typeof Primitive.Trigger>,
) {
	return <Primitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
	className,
	sideOffset = 10,
	...props
}: React.ComponentProps<typeof Primitive.Content>) {
	return (
		<Primitive.Portal>
			<Primitive.Content
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				className={cn(
					"z-50 min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-2xl border border-line bg-surface-2/95 p-1.5 text-text shadow-[0_24px_56px_rgba(0,0,0,0.55)] backdrop-blur-xl",
					className,
				)}
				{...props}
			/>
		</Primitive.Portal>
	);
}

function DropdownMenuItem({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Item>) {
	return (
		<Primitive.Item
			data-slot="dropdown-menu-item"
			className={cn(
				"relative flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.92rem] font-medium text-muted transition-colors outline-none select-none",
				"focus:bg-white/6 focus:text-text data-disabled:pointer-events-none data-disabled:opacity-50",
				"[&_svg]:size-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuLabel({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Label>) {
	return (
		<Primitive.Label
			data-slot="dropdown-menu-label"
			className={cn("px-3 py-2 text-sm font-semibold", className)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Separator>) {
	return (
		<Primitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1.5 my-1.5 h-px bg-line", className)}
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
};
