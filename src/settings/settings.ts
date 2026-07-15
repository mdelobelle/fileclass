/*
 * Plugin settings (ARCHITECTURE.md §5, §10). A slim subset of Metadata Menu's
 * settings — only what the schema layer needs. Persisted via the plugin's
 * loadData/saveData.
 */

export interface FileclassSettings {
	/** Folder holding fileClass notes, normalized to a trailing "/". */
	classFilesPath: string;
	/** Frontmatter key binding a note to its fileClass(es). */
	fileClassAlias: string;
	/** fileClass applied to every note that has no other binding (optional). */
	globalFileClass: string;
	/** Default icon for a fileClass without an explicit `icon`. */
	fileClassIcon: string;
}

export const DEFAULT_SETTINGS: FileclassSettings = {
	classFilesPath: "",
	fileClassAlias: "fileClass",
	globalFileClass: "",
	fileClassIcon: "file-spreadsheet",
};

/** Normalizes a folder path to `""` or a trailing-slashed, non-leading form. */
export function normalizeFolderPath(path: string): string {
	const trimmed = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
	return trimmed ? `${trimmed}/` : "";
}

/** Merges persisted data over defaults and normalizes derived values. */
export function coerceSettings(data: unknown): FileclassSettings {
	const merged = { ...DEFAULT_SETTINGS, ...(data as Partial<FileclassSettings> | null) };
	return { ...merged, classFilesPath: normalizeFolderPath(merged.classFilesPath) };
}
