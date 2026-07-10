// Accent presets. The rest of the palette stays put; only the two accent
// tokens move, which is exactly what the CSS was built around.

export const ACCENTS = {
	// Sampled from the logo mark itself.
	"walltch-blue": {
		name: "Walltch Blue",
		accent: "#0353f2",
		accent2: "#09a2fb",
	},
	violet: { name: "Violet", accent: "#7c3aed", accent2: "#c084fc" },
	emerald: { name: "Emerald", accent: "#059669", accent2: "#34d399" },
	ember: { name: "Ember", accent: "#ea580c", accent2: "#fbbf24" },
	rose: { name: "Rose", accent: "#e11d48", accent2: "#fb7185" },
} as const;

export type AccentId = keyof typeof ACCENTS;

export function applyAccent(id: string) {
	const preset = ACCENTS[id as AccentId] ?? ACCENTS["walltch-blue"];
	const root = document.documentElement.style;
	root.setProperty("--accent", preset.accent);
	root.setProperty("--accent-2", preset.accent2);
}
