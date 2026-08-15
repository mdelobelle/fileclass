/*
 * Pure helpers for the fileclass-table view (ARCHITECTURE.md §11). A Bases
 * column id is `note.<field>`, `file.<prop>`, or `formula.<name>`. Only
 * `note.<field>` columns map to editable fileClass fields.
 */

/** The custom Bases view type registered by Fileclass (editable cells). */
export const FILECLASS_TABLE_VIEW = "fileclass-table";

/** The icon it registers with, reused wherever one of these views is named elsewhere. */
export const FILECLASS_TABLE_ICON = "table-config";

/** Field name for a `note.<field>` column, else null (file/formula columns). */
export function fieldNameOfColumn(columnId: string): string | null {
	return columnId.startsWith("note.") ? columnId.slice("note.".length) : null;
}

/**
 * The field a column names, among a class's fields — by name, and failing that by name ignoring
 * case.
 *
 * Bases hands a view the column id from Obsidian's **property registry**, whose entries are keyed
 * in lowercase but carry the display name of the first spelling the vault used. A vault where 482
 * notes write `Status:` and 927 write `status:` therefore gets `note.Status` for a class whose
 * field is `status` — measured on a real vault, where the column was simply not editable and
 * nothing said why.
 *
 * Exact first, so a class that really does declare two fields differing only in case keeps its
 * own; the fallback only ever fires where an exact match found nothing.
 */
export function fieldForColumn<T extends { name: string }>(
	columnId: string,
	fields: readonly T[],
	accept: (field: T) => boolean = () => true
): T | undefined {
	const name = fieldNameOfColumn(columnId);
	if (name === null) return undefined;
	const exact = fields.find((f) => f.name === name && accept(f));
	if (exact) return exact;
	const lower = name.toLowerCase();
	return fields.find((f) => f.name.toLowerCase() === lower && accept(f));
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
