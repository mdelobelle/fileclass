/*
 * Pure helpers for the fileclass-table view (ARCHITECTURE.md §11). A Bases
 * column id is `note.<field>`, `file.<prop>`, or `formula.<name>`. Only
 * `note.<field>` columns map to editable fileClass fields.
 */

/** The custom Bases view type registered by Fileclass (editable cells). */
export const FILECLASS_TABLE_VIEW = "fileclass-table";

/** Field name for a `note.<field>` column, else null (file/formula columns). */
export function fieldNameOfColumn(columnId: string): string | null {
	return columnId.startsWith("note.") ? columnId.slice("note.".length) : null;
}

/** Human header label for a column id. */
export function columnLabel(columnId: string): string {
	if (columnId.startsWith("note.")) return columnId.slice("note.".length);
	if (columnId === "file.name") return "Name";
	if (columnId.startsWith("file.")) return columnId.slice("file.".length);
	if (columnId.startsWith("formula.")) return columnId.slice("formula.".length);
	return columnId;
}

/** A piece of a rendered cell: an internal link, or plain text. */
export type CellSegment = { link: string; display: string } | { text: string };

const WIKILINK_RE = /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

/** Splits a cell's text into wikilink segments and plain-text runs. */
export function parseCellSegments(text: string): CellSegment[] {
	const segments: CellSegment[] = [];
	let last = 0;
	let m: RegExpExecArray | null;
	WIKILINK_RE.lastIndex = 0;
	while ((m = WIKILINK_RE.exec(text)) !== null) {
		if (m.index > last) segments.push({ text: text.slice(last, m.index) });
		segments.push({ link: m[1].trim(), display: (m[2] ?? m[1]).trim() });
		last = WIKILINK_RE.lastIndex;
	}
	if (last < text.length) segments.push({ text: text.slice(last) });
	return segments;
}
