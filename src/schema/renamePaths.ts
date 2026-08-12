/*
 * Noticing that a schema now points at something that moved (#159).
 *
 * Obsidian rewrites the links in a note's **body** when a file is renamed. A path stored in a class
 * note's frontmatter is a plain string — a known limit of properties, not a Fileclass one — so
 * renaming the note a `Select` draws its values from, or a base a field takes candidates from, or a
 * folder a class claims, leaves the schema pointing at what is no longer there. Measured on 1.13.6:
 * the values list goes empty, the candidate list goes empty, and a class stops claiming its
 * folder's notes, all three in silence.
 *
 * Fileclass **says so and stops there**. It does not edit the schema back into shape: a definition
 * is the author's, and rewriting one nobody asked to have rewritten is the kind of help that has to
 * be undone. The message names what to open; the change stays a decision.
 *
 * Pure: what counts as a stale reference is decided here and unit-tested; reading the class notes
 * and raising the notice is `renameNotice.ts` next door.
 */

/** The path-shaped option keys of a **field**, by what they name. */
const FIELD_FILE_KEYS = ["valuesListNotePath", "baseFile", "canvasPath"] as const;
/** The path-shaped option keys of a **class**. */
const CLASS_FILE_KEYS = ["baseFile"] as const;

export interface RenameEvent {
	oldPath: string;
	newPath: string;
	/** A folder carries everything under it; a file matches on its own. */
	isFolder: boolean;
}

/**
 * Whether `stored` referred to what just moved.
 *
 * A folder matches by **prefix**, since renaming `Reading list` also moves `Reading list/Archive` —
 * the same reasoning that makes a class's folder binding a prefix test (`file.inFolder`), so the
 * two agree.
 *
 * A file matches exactly, or without its `.md` extension: a `valuesListNotePath` may be stored
 * either way, since the resolver accepts both, and warning about one form only would look
 * arbitrary from the outside.
 */
export function pathMatchesRename(stored: string, ev: RenameEvent): boolean {
	const value = stored.trim();
	if (!value) return false;

	if (ev.isFolder) {
		return value === ev.oldPath || value.startsWith(`${ev.oldPath}/`);
	}
	if (value === ev.oldPath) return true;
	// Stored without the extension, e.g. `7_System/Ratings` for `7_System/Ratings.md`.
	return ev.oldPath.endsWith(".md") && value === ev.oldPath.replace(/\.md$/, "");
}

/** One place a schema still names what moved. */
export interface StaleReference {
	/** The field the option belongs to, or undefined for a class-level option. */
	field?: string;
	key: string;
	path: string;
}

type Options = Record<string, unknown>;

function collect(options: Options, keys: readonly string[], ev: RenameEvent, field?: string): StaleReference[] {
	const out: StaleReference[] = [];
	for (const key of keys) {
		const value = options[key];
		if (typeof value === "string" && pathMatchesRename(value, ev)) {
			out.push({ field, key, path: value });
		}
	}
	return out;
}

/** A field as it sits in a class note's `fields:` list. */
interface RawFieldEntry {
	name?: unknown;
	options?: unknown;
}

/**
 * Every reference in one class note's frontmatter that the rename made stale.
 *
 * Reads only; nothing here mutates its argument. Three shapes are covered: a field's options
 * (`valuesListNotePath`, `baseFile`, `canvasPath`), the class's own `baseFile`, and `filesPaths` —
 * the folder list, which is the one with teeth, since left stale the class quietly stops claiming
 * the notes it was written for.
 *
 * Only the keys this plugin puts paths in are examined. A user's own key that happens to hold
 * something path-shaped is not guessed at.
 */
export function staleReferences(fm: Options, ev: RenameEvent): StaleReference[] {
	const found: StaleReference[] = [];

	const fields = Array.isArray(fm.fields) ? (fm.fields as RawFieldEntry[]) : [];
	for (const entry of fields) {
		const options = entry?.options;
		if (!options || typeof options !== "object" || Array.isArray(options)) continue;
		const name = typeof entry.name === "string" ? entry.name : undefined;
		found.push(...collect(options as Options, FIELD_FILE_KEYS, ev, name));
	}

	found.push(...collect(fm, CLASS_FILE_KEYS, ev));

	// Folders only: renaming a file cannot make a folder binding stale.
	if (ev.isFolder && Array.isArray(fm.filesPaths)) {
		for (const value of fm.filesPaths as unknown[]) {
			if (typeof value === "string" && pathMatchesRename(value, ev)) {
				found.push({ key: "filesPaths", path: value });
			}
		}
	}

	return found;
}

/** What a class calls one of its stale references: `Book › rating`, or `Book › filesPaths`. */
export function referenceLabel(fileClass: string, ref: StaleReference): string {
	return `${fileClass} › ${ref.field ?? ref.key}`;
}

/**
 * What breaks if this particular reference is left alone.
 *
 * Not one sentence for all of them: a folder binding does not feed values, it decides which notes
 * carry the class at all — measured, and the generic wording was wrong in exactly the case with the
 * most teeth.
 */
export function consequenceOf(ref: StaleReference): string {
	if (ref.key === "filesPaths") return "notes in that folder no longer carry the class";
	if (ref.key === "canvasPath") return "the field stops following the canvas";
	if (ref.key === "valuesListNotePath") return "the field offers no values";
	// `baseFile` on a field is its candidate source; on a class it is the table Fileclass syncs.
	return ref.field ? "the field offers no candidates" : "the class has no base to sync";
}

/**
 * The warning's text.
 *
 * Names what moved, then where it is still named, then what to do — a notice that only reported a
 * fact would leave the reader to find the fields themselves. Capped at three, because a notice is
 * read at a glance and the schema editor lists the rest.
 */
export function describeStale(oldPath: string, labels: readonly string[], consequence: string): string {
	const shown = labels.slice(0, 3).join(", ");
	const rest = labels.length > 3 ? `, and ${labels.length - 3} more` : "";
	const one = labels.length === 1;
	return (
		`Fileclass: "${oldPath}" moved, and ${one ? "a fileClass" : "fileClasses"} ` +
		`still point${one ? "s" : ""} at it — ${shown}${rest}. ` +
		`Until the definition is updated, ${consequence}.`
	);
}
