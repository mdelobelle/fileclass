/*
 * Where a new note of a fileClass goes, and what it is called (#84).
 *
 * Pure: the cascade, the de-duplication and the seeding rules are decided here and unit-tested; the
 * creating, templating and frontmatter writing is `createNoteWithClass.ts`.
 */

/**
 * One way to create a note of this class: where it goes, and what it starts from.
 *
 * A class often has **several**. A `Person` met professionally starts from one template and lands in
 * one folder; the same class for an artist starts from another and lands elsewhere — same schema,
 * same fields, two contexts. One folder and one template per class could not say that.
 */
export interface NoteDestination {
	/**
	 * What the reader calls this context — `Professional`, `Artist`.
	 *
	 * A name rather than a description of the paths: the two folders may be siblings and the two
	 * templates near-homonyms, and only the author knows which one *means* what. Optional, because an
	 * entry written by hand or read from 0.2.13's single pair has none, and a list still has to read.
	 */
	name?: string;
	folder?: string;
	template?: string;
}

/** What a class says about where its notes live. */
export interface NoteTargetOptions {
	/** The destinations the class offers, in the order they were declared. */
	newNotes?: readonly NoteDestination[];
	/** 0.2.13's single folder — read when `newNotes` is absent (see `noteDestinations`). */
	fileClassNotesFolder?: string;
	/** 0.2.13's single template, same story. */
	fileClassNoteTemplate?: string;
	/** The folders the class binds notes from — used when it declares exactly one. */
	filesPaths?: readonly string[];
}

/**
 * The destinations a class offers, from either spelling.
 *
 * 0.2.13 wrote a single `fileClassNotesFolder` + `fileClassNoteTemplate`; a vault configured then
 * keeps working, read as a list of one. The options editor writes the list, so the first save through
 * it leaves the old pair behind — the compatibility is a read, not a second way to configure.
 */
export function noteDestinations(options: NoteTargetOptions): NoteDestination[] {
	const declared = (options.newNotes ?? [])
		.map((d) => ({
			name: d.name?.trim() || undefined,
			folder: d.folder?.trim() || undefined,
			template: d.template?.trim() || undefined,
		}))
		.filter((d) => d.folder || d.template);
	if (declared.length) return declared;
	const legacy = {
		folder: options.fileClassNotesFolder?.trim() || undefined,
		template: options.fileClassNoteTemplate?.trim() || undefined,
	};
	return legacy.folder || legacy.template ? [legacy] : [];
}

/**
 * How a destination names itself in a list or a picker.
 *
 * **Its name when it has one** — that is what the field is for, and two sibling folders holding
 * near-homonymous templates are told apart by intent, not by path. Failing that, the **basenames**:
 * a row reading `1_People/Contacts › 3_Templater/Templates/Person pro.md` spends its width on the
 * prefix that distinguishes nothing, where the last segment is what the reader chose. The full paths
 * stay one line below, in the row's description.
 */
export function destinationLabel(destination: NoteDestination, fallback = "New note"): string {
	const named = destination.name?.trim();
	if (named) return named;
	const last = (path?: string): string | undefined => {
		const clean = path?.replace(/\/+$/, "").trim();
		if (!clean) return undefined;
		return clean.slice(clean.lastIndexOf("/") + 1).replace(/\.md$/, "");
	};
	const folder = last(destination.folder) ?? "the default folder";
	const template = last(destination.template);
	return template ? `${folder} › ${template}` : destination.folder ? folder : fallback;
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
export function noteFolder(
	options: NoteTargetOptions,
	obsidianDefault: string,
	chosen?: NoteDestination
): string {
	const explicit = (chosen?.folder ?? options.fileClassNotesFolder)?.trim().replace(/\/+$/, "");
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
	/** Write it as a one-item list — a filter on a `Multi` field fixes a member, not the whole. */
	list?: boolean;
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
