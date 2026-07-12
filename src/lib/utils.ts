import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class lists, letting a later utility win over an earlier one that
 * sets the same property — what every shadcn component expects to exist. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
