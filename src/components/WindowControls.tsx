import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

/** Minimize / maximize / close for the frameless window. Shared, because
 * the sign-in and setup screens replace the shell but still need a way to
 * move and close the window. */
function WindowControls() {
	const win = getCurrentWindow();
	return (
		<div className="win-controls">
			<button
				type="button"
				onClick={() => win.minimize()}
				aria-label="Minimize"
			>
				<Minus aria-hidden />
			</button>
			<button
				type="button"
				onClick={() => win.toggleMaximize()}
				aria-label="Maximize"
			>
				<Square aria-hidden />
			</button>
			<button
				type="button"
				className="win-close"
				onClick={() => win.close()}
				aria-label="Close"
			>
				<X aria-hidden />
			</button>
		</div>
	);
}

export default WindowControls;
