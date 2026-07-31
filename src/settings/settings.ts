/*
 * Plugin settings (ARCHITECTURE.md §5, §10). A slim subset of Metadata Menu's
 * settings — only what the schema layer needs. Persisted via the plugin's
 * loadData/saveData.
 */
import { DateFormatDefaults } from "../fields/dateFormats";


export interface FileclassSettings {
	/** Frontmatter key binding a note to its fileClass(es). */
	fileClassAlias: string;
	/** fileClass applied to every note that has no other binding (optional). */
	globalFileClass: string;
	/** Folder where generated `<fileClass>.base` files are written (trailing /). */
	basesFolder: string;
	/** Default icon for a fileClass without an explicit `icon`. */
	fileClassIcon: string;
	/**
	 * Default moment.js format a `Date` field is *written* in when it has no
	 * format of its own ("" = the native ISO form). Not a display setting.
	 */
	defaultDateFormat: string;
	/** Same, for `DateTime` fields ("" = YYYY-MM-DDTHH:mm). */
	defaultDateTimeFormat: string;
	/** Same, for `Time` fields ("" = HH:mm). */
	defaultTimeFormat: string;
	/** Auto-maintain Canvas/CanvasGroup/CanvasGroupLink fields from .canvas files. */
	enableCanvasEngine: boolean;
	/** Add computed valid/errors columns to the editable fileclass-table view. */
	enableValidationColumns: boolean;
	/** Add Fileclass entries to the file/editor context menus. */
	enableContextMenu: boolean;
	/** Insert a class's missing fields as soon as the class is bound to a note. */
	insertFieldsOnBind: boolean;
	/** Show an edit button on matching rows of the native Properties editor. */
	enablePropertyEditButtons: boolean;
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
	/** User-defined custom colors (CSS values), offered by every Color picker. */
	customColors: string[];
}

export const DEFAULT_SETTINGS: FileclassSettings = {
	fileClassAlias: "fileClass",
	globalFileClass: "",
	basesFolder: "",
	fileClassIcon: "file-spreadsheet",
	defaultDateFormat: "",
	defaultDateTimeFormat: "",
	defaultTimeFormat: "",
	enableCanvasEngine: true,
	enableValidationColumns: true,
	enableContextMenu: true,
	insertFieldsOnBind: true,
	enablePropertyEditButtons: true,
	enableTabHeaderIndicator: true,
	enableFileExplorerIndicator: true,
	enableBookmarksIndicator: true,
	enableInlineLinkIndicator: true,
	enableBacklinkIndicator: true,
	enableBasesIndicator: true,
	customColors: [],
};

/** Normalizes a folder path to `""` or a trailing-slashed, non-leading form. */
export function normalizeFolderPath(path: string): string {
	const trimmed = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
	return trimmed ? `${trimmed}/` : "";
}

/** Merges persisted data over defaults and normalizes derived values. */
/** The per-type write formats, as the date helpers expect them. */
export function dateFormatDefaults(settings: FileclassSettings): DateFormatDefaults {
	return {
		Date: settings.defaultDateFormat,
		DateTime: settings.defaultDateTimeFormat,
		Time: settings.defaultTimeFormat,
	};
}

export function coerceSettings(data: unknown): FileclassSettings {
	const stored = (data ?? {}) as Partial<FileclassSettings> & Record<string, unknown>;
	const merged = { ...DEFAULT_SETTINGS, ...stored };
	// `defaultDateDisplayFormat` (<= 0.1.1) reformatted dates on screen only. Its
	// successor decides what gets *written*, so the old value is deliberately not
	// carried over: inheriting it would silently rewrite every new date in a
	// human format, and lose the ordering ISO gives.
	delete (merged as Record<string, unknown>).defaultDateDisplayFormat;
	return {
		...merged,
		basesFolder: normalizeFolderPath(merged.basesFolder),
		customColors: Array.isArray(merged.customColors)
			? merged.customColors.filter((c): c is string => typeof c === "string")
			: [],
	};
}
