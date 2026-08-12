/*
 * Plugin settings (ARCHITECTURE.md §5, §10). A slim subset of Metadata Menu's
 * settings — only what the schema layer needs. Persisted via the plugin's
 * loadData/saveData.
 */
import { DateFormatDefaults } from "../fields/dateFormats";
import { UnknownKeysPosition } from "../schema/reorder";


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
	/**
	 * Keep a `fileclass.log` beside the class notes, recording what left a definition pointing
	 * elsewhere (#159). A notice lasts fifteen seconds; this is what you read three weeks later.
	 */
	enableSchemaLog: boolean;
	/**
	 * How many entries the live log keeps before the file rolls over to an archive (#159).
	 * Counted in entries rather than bytes: the cap exists so the window opens on a readable
	 * amount of history. 0 turns rotation off and lets the file grow.
	 */
	schemaLogMaxEntries: number;
	/** How many rolled-over archives to keep under `<class folder>/.logs`. 0 discards them. */
	schemaLogArchives: number;
	/** Insert a class's missing fields as soon as the class is bound to a note. */
	insertFieldsOnBind: boolean;
	/**
	 * Rewrite a note's frontmatter in its class's field order after inserting missing fields
	 * (#104). Off by default: it rewrites the whole block, so it touches lines the user did
	 * not ask to edit and it shows up in a git diff.
	 */
	reorderOnInsert: boolean;
	/**
	 * Where the schema canvas lives (#149). Blank = `<class folder>/Schema.canvas`.
	 *
	 * A setting rather than a convention because the file is arranged by hand: someone who
	 * moves it out of the class folder should not have a second one generated behind them.
	 */
	schemaCanvasPath: string;
	/** Where keys no class declares go when the frontmatter is reordered. */
	unknownKeysPosition: UnknownKeysPosition;
	/**
	 * Undocumented, and deliberately absent from the settings tab: shortens every modal of
	 * this plugin — enough to clear a three-line subtitle — and pins it 45px from the top.
	 *
	 * It exists for **recording**. The demo takes burn their subtitles into the bottom of the
	 * frame, and a tall modal — a note with sixteen fields — reaches down into them. Set it by
	 * hand in `data.json` (`"shorterModal": true`); the demo tooling sets it for every staged
	 * vault. A setting nobody but a screen recorder wants does not belong in a settings pane.
	 */
	shorterModal?: boolean;
	/**
	 * Let a modal be dragged by its title, cascade a stack of them, and dim the app once
	 * rather than once per modal. A stack stays **LIFO for the pointer** as it already is
	 * for the keyboard (#118): only the topmost modal answers a click, the ones below are
	 * dimmed and inert, and they can still be dragged by their title — a background window
	 * you may move but not act inside. Experimental and desktop-only: it works by
	 * neutralising Obsidian's own full-window modal backdrops, which is a shared surface —
	 * hence off by default.
	 */
	enableDraggableModals: boolean;
	/** Show an edit button on matching rows of the native Properties editor. */
	enablePropertyEditButtons: boolean;
	/** Show "Add a class" / "Insert missing fields" next to "Add property". */
	enablePropertyActionButtons: boolean;
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
	classFilesPath: "",
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
	enableSchemaLog: true,
	schemaLogMaxEntries: 500,
	schemaLogArchives: 5,
	insertFieldsOnBind: true,
	reorderOnInsert: false,
	schemaCanvasPath: "",
	unknownKeysPosition: "top",
	shorterModal: false,
	enableDraggableModals: false,
	enablePropertyEditButtons: true,
	enablePropertyActionButtons: true,
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
		classFilesPath: normalizeFolderPath(merged.classFilesPath),
		basesFolder: normalizeFolderPath(merged.basesFolder),
		customColors: Array.isArray(merged.customColors)
			? merged.customColors.filter((c): c is string => typeof c === "string")
			: [],
	};
}
