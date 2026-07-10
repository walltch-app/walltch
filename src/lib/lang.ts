// Subtitle language handling. Addons and media files disagree on codes
// ("tr" vs "tur" vs "Turkish"), so each option carries its aliases.

export const SUBTITLE_LANGS: {
	id: string;
	name: string;
	aliases: string[];
}[] = [
	{ id: "", name: "Off", aliases: [] },
	{ id: "tr", name: "Türkçe", aliases: ["tr", "tur", "turkish"] },
	{ id: "en", name: "English", aliases: ["en", "eng", "english"] },
	{ id: "es", name: "Español", aliases: ["es", "spa", "spanish"] },
	{ id: "de", name: "Deutsch", aliases: ["de", "ger", "deu", "german"] },
	{ id: "fr", name: "Français", aliases: ["fr", "fre", "fra", "french"] },
	{ id: "it", name: "Italiano", aliases: ["it", "ita", "italian"] },
	{ id: "pt", name: "Português", aliases: ["pt", "por", "portuguese", "pob"] },
	{ id: "ru", name: "Русский", aliases: ["ru", "rus", "russian"] },
	{ id: "ar", name: "العربية", aliases: ["ar", "ara", "arabic"] },
	{ id: "ja", name: "日本語", aliases: ["ja", "jpn", "japanese"] },
	{ id: "ko", name: "한국어", aliases: ["ko", "kor", "korean"] },
	{ id: "zh", name: "中文", aliases: ["zh", "chi", "zho", "chinese"] },
];

export function langAliases(id: string): string[] {
	return SUBTITLE_LANGS.find((l) => l.id === id)?.aliases ?? [id];
}

/** Does a track/subtitle language tag belong to the preferred language? */
export function langMatches(preferredId: string, lang: string): boolean {
	if (!preferredId) return false;
	const tag = lang.toLowerCase();
	return langAliases(preferredId).some(
		(alias) => tag === alias || tag.startsWith(`${alias}-`),
	);
}
