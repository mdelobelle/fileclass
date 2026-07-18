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
	/** Folder where generated `<fileClass>.base` files are written (trailing /). */
	basesFolder: string;
	/** Default icon for a fileClass without an explicit `icon`. */
	fileClassIcon: string;
	/** Default moment.js format for displaying dates ("" = show stored value). */
	defaultDateDisplayFormat: string;
	/** Auto-maintain Canvas/CanvasGroup/CanvasGroupLink fields from .canvas files. */
	enableCanvasEngine: boolean;
	/** Add Fileclass entries to the file/editor context menus. */
	enableContextMenu: boolean;
	/** Show the field indicator icon in the tab header. */
	enableTabHeaderIndicator: boolean;
	/** Show the field indicator icon in the file explorer. */
	enableFileExplorerIndicator: boolean;
	/** Show the field indicator icon in the bookmarks pane. */
	enableBookmarksIndicator: boolean;
	/** Show the indicator after internal links (reading view). */
	enableInlineLinkIndicator: boolean;
	/** Show the indicator on links in the backlinks pane. */
	enableBacklinkIndicator: boolean;
	/** Show the indicator on links in Bases table views. */
	enableBasesIndicator: boolean;
}

export const DEFAULT_SETTINGS: FileclassSettings = {
	classFilesPath: "",
	fileClassAlias: "fileClass",
	globalFileClass: "",
	basesFolder: "",
	fileClassIcon: "file-spreadsheet",
	defaultDateDisplayFormat: "",
	enableCanvasEngine: true,
	enableContextMenu: true,
	enableTabHeaderIndicator: true,
	enableFileExplorerIndicator: true,
	enableBookmarksIndicator: true,
	enableInlineLinkIndicator: true,
	enableBacklinkIndicator: true,
	enableBasesIndicator: true,
};

/** Normalizes a folder path to `""` or a trailing-slashed, non-leading form. */
export function normalizeFolderPath(path: string): string {
	const trimmed = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
	return trimmed ? `${trimmed}/` : "";
}

/** Merges persisted data over defaults and normalizes derived values. */
export function coerceSettings(data: unknown): FileclassSettings {
	const merged = { ...DEFAULT_SETTINGS, ...(data as Partial<FileclassSettings> | null) };
	return {
		...merged,
		classFilesPath: normalizeFolderPath(merged.classFilesPath),
		basesFolder: normalizeFolderPath(merged.basesFolder),
	};
}
