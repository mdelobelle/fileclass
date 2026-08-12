/*
 * Where a new note of a fileClass goes, and what it is called (#84).
 *
 * Pure: the cascade, the de-duplication and the seeding rules are decided here and unit-tested; the
 * creating, templating and frontmatter writing is `createNoteWithClass.ts`.
 */

/** What a class says about where its notes live. */
export interface NoteTargetOptions {
	/** The explicit target folder, when the class declares one. */
	fileClassNotesFolder?: string;
	/** The folders the class binds notes from — used when it declares exactly one. */
	filesPaths?: readonly string[];
}

/**
 * The folder a new note of this class belongs in.
 *
 * The cascade, in the order the issue settles it: the explicit option; then the class's single
 * `filesPaths` entry — a class bound to one folder has already said where its notes live, and
 * asking twice would be a second answer to the same question; then Obsidian's own default folder
 * for new notes.
 *
 * With **several** bound folders the class has not said which, so nothing is guessed: the caller
 * falls back to the vault's default rather than picking the first, which would be a coin toss
 * dressed up as a decision.
 */
export function noteFolder(options: NoteTargetOptions, obsidianDefault: string): string {
	const explicit = options.fileClassNotesFolder?.trim().replace(/\/+$/, "");
	if (explicit) return explicit;
	const bound = (options.filesPaths ?? []).map((p) => p.trim().replace(/\/+$/, "")).filter(Boolean);
	if (bound.length === 1) return bound[0];
	return obsidianDefault.trim().replace(/\/+$/, "");
}

/** Characters Obsidian refuses in a file name, and the leading dots that would hide it. */
const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;

/**
 * A typed name turned into a file name Obsidian will accept.
 *
 * Stripped rather than rejected: someone typing `Dune: part two` means a note, not an error
 * message, and every surface that names a file has to answer the same way.
 */
export function safeFileName(input: string, fallback: string): string {
	const cleaned = input.replace(ILLEGAL, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "").trim();
	return cleaned || fallback;
}

/**
 * A path that does not exist yet: `Book`, then `Book 1`, `Book 2`…
 *
 * Obsidian's own numbering, because `vault.create` throws on a path that exists and a creation that
 * failed because of a name collision is a poor way to learn that a note already had that name.
 */
export function uniquePath(folder: string, baseName: string, exists: (path: string) => boolean): string {
	const dir = folder ? `${folder.replace(/\/+$/, "")}/` : "";
	let candidate = `${dir}${baseName}.md`;
	for (let n = 1; exists(candidate); n += 1) candidate = `${dir}${baseName} ${n}.md`;
	return candidate;
}

/** A value to pre-fill on the new note, and the field it belongs to. */
export interface Seed {
	field: string;
	/** How the button says what it will do: "New Book with Frank Herbert". */
	label: string;
	/** A literal value to write. */
	value?: string;
	/**
	 * A note to link to, when the seeded field holds links.
	 *
	 * A path rather than a rendered `[[wikilink]]`: the link's shape is the vault's business
	 * (shortest form, relative, markdown), and only Obsidian knows it — and only once the new note's
	 * own path exists to be relative to.
	 */
	linkTo?: string;
}

/**
 * How a template's values and a seed meet.
 *
 * Template first, fields second, so a duplicate frontmatter block is impossible by construction and
 * a key the template set is kept (`insertMissingFields` only fills what is missing). The **seed is
 * the exception**: clicking "New Book with Frank Herbert" is an unambiguous instruction about that
 * one field, where a template's default is a general preference. So the seed overwrites, and
 * nothing else does.
 */
export function seedWins(templateValue: unknown, seed: Seed | undefined, field: string): boolean {
	return !!seed && seed.field === field && templateValue !== undefined;
}
