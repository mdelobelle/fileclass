/*
 * Per-field-type icon (ARCHITECTURE.md §7). Pure. Names are Metadata Menu's
 * intent mapped to icons that exist in Obsidian's bundled Lucide set (MDM's
 * legacy glyph names like "plus-minus-glyph" are replaced). Used wherever a
 * type is shown as an icon rather than a text label (Properties buttons,
 * note-fields modal).
 */
import { FieldType } from "../schema/field";

const TYPE_ICONS: Record<FieldType, string> = {
	Input: "pencil",
	MultiInput: "list-plus",
	Number: "hash",
	Boolean: "toggle-left",
	Select: "chevrons-up-down",
	Cycle: "rotate-cw",
	Date: "calendar",
	DateTime: "calendar-clock",
	Time: "clock",
	Duration: "timer",
	CycleDuration: "list-ordered",
	Location: "map-pin",
	Icon: "shapes",
	Multi: "list-checks",
	File: "file",
	MultiFile: "files",
	Media: "image",
	MultiMedia: "images",
	Object: "package",
	ObjectList: "boxes",
	JSON: "braces",
	YAML: "file-code",
	Lookup: "file-search",
	Formula: "square-function",
	Canvas: "layout-dashboard",
	CanvasGroup: "box-select",
	CanvasGroupLink: "box-select",
};

export function fieldTypeIcon(type: FieldType): string {
	return TYPE_ICONS[type] ?? "tag";
}
