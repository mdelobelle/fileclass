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
	return destinationPaths(destination) || fallback;
}

/**
 * `Contacts › Person pro` — the folder and the template by their **basenames**.
 *
 * Full paths are what made the raw value unreadable; the last segment is what tells two
 * destinations apart. Empty when the destination names neither, which cannot be saved from the
 * modal but can be hand-written.
 */
export function destinationPaths(destination: NoteDestination): string {
	const last = (path?: string): string | undefined => {
		const clean = path?.replace(/\/+$/, "").trim();
		if (!clean) return undefined;
		return clean.slice(clean.lastIndexOf("/") + 1).replace(/\.md$/, "");
	};
	const folder = last(destination.folder);
	const template = last(destination.template);
	if (folder && template) return `${folder} › ${template}`;
	if (folder) return folder;
	return template ? `the default folder › ${template}` : "";
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

/**
 * The destination a caller named, or the class's default.
 *
 * Matched on the destination's **name**, case-insensitively: a name is what the reader (or an agent
 * relaying them) says — "Professional", "professional" — while a path is an implementation detail.
 * Absent or blank, the first declared destination is taken, the one the picker lists first; a class
 * with none answers `undefined`, which `noteFolder` turns into the vault's default folder.
 *
 * An unknown name is refused rather than defaulted: guessing would put the note in a context the
 * caller explicitly did not ask for. The refusal lists what the class does offer, so the caller can
 * correct itself without another round trip.
 */
export function chooseDestination(
	fileClass: string,
	destinations: readonly NoteDestination[],
	requested?: string
): { ok: true; destination?: NoteDestination } | { ok: false; message: string } {
	const wanted = requested?.trim().toLowerCase();
	if (!wanted) return { ok: true, destination: destinations[0] };
	const found = destinations.find((d) => d.name?.trim().toLowerCase() === wanted);
	if (found) return { ok: true, destination: found };
	const offered = destinations.map((d) => d.name?.trim() || `(unnamed: ${destinationLabel(d)})`);
	return {
		ok: false,
		message: offered.length
			? `Unknown destination "${requested ?? ""}" for "${fileClass}". It offers: ${offered.join(", ")}.`
			: `Unknown destination "${requested ?? ""}": "${fileClass}" declares no destination.`,
	};
}

/**
 * What a link seed names, with the wrapping a caller may have added taken off.
 *
 * `[[AC-DC]]`, `[[Bands/AC-DC|AC/DC]]` and `AC-DC` all name the same note; only the link target is
 * resolved, and Fileclass builds the link itself (the vault's own format, from the new note).
 */
export function linkTarget(raw: string): string {
	const inner = raw.trim().replace(/^\[\[/, "").replace(/\]\]$/, "");
	const pipe = inner.indexOf("|");
	return (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
}

/** A value to pre-fill — the command's `Seed`, or what an API caller sends (lists allowed). */
export interface SeedSpec {
	field: string;
	/** A literal value, written as is; a list stays a list. */
	value?: string | string[];
	/** A note (path or name) to link to; a list gives a list of links. */
	linkTo?: string | string[];
	/** Wrap a single value into a one-item list. */
	list?: boolean;
}

/** What the seeds will write, in order, and what could not be applied. */
export interface SeedPlan {
	writes: { field: string; value: string | string[] }[];
	warnings: string[];
}

/**
 * Decides what the seeds write — **best effort**, never a reason to refuse the note.
 *
 * - a seed on a field the class does not have is skipped and said;
 * - `linkTo` targets are resolved by `resolveLink` (Obsidian's own link resolution, from the new
 *   note) into links; one that resolves to no note is skipped and said. A list stays a list of the
 *   links that did resolve;
 * - a link seed that resolved nothing falls back to its literal `value`, as the command always did;
 * - an empty value writes nothing (a filter fixing a blank is no instruction);
 * - a seed of the wrong **shape** (not an object, no string `field`, a `linkTo` that is not a string
 *   or a list of strings) is skipped and said too. It comes from JSON a caller built — `obsidian
 *   eval`, an agent — and the API promises not to throw for what a caller sent.
 *
 * Values are not validated: the class's validation reports them afterwards, like any other value.
 */
export function planSeeds(
	seeds: unknown,
	fileClass: string,
	knownFields: ReadonlySet<string>,
	resolveLink: (target: string) => string | null
): SeedPlan {
	const plan: SeedPlan = { writes: [], warnings: [] };
	if (!Array.isArray(seeds)) {
		if (seeds !== undefined && seeds !== null) plan.warnings.push("Seeds ignored: `seeds` is not a list.");
		return plan;
	}
	seeds.forEach((raw: unknown, i: number) => {
		const shapeError = seedShapeError(raw);
		if (shapeError) {
			plan.warnings.push(`Seed #${i + 1} ignored: ${shapeError}`);
			return;
		}
		planOne(raw as SeedSpec, fileClass, knownFields, resolveLink, plan);
	});
	return plan;
}

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Why a seed cannot be read at all, or null when its shape is right. Values stay unvalidated. */
function seedShapeError(raw: unknown): string | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "it is not an object.";
	const seed = raw as Record<string, unknown>;
	if (typeof seed.field !== "string" || !seed.field) return "`field` is not a non-empty string.";
	if (seed.linkTo !== undefined && typeof seed.linkTo !== "string" && !isStringList(seed.linkTo)) {
		return `\`linkTo\` on "${seed.field}" is not a string or a list of strings.`;
	}
	return null;
}

function planOne(
	seed: SeedSpec,
	fileClass: string,
	knownFields: ReadonlySet<string>,
	resolveLink: (target: string) => string | null,
	plan: SeedPlan
): void {
	if (!knownFields.has(seed.field)) {
		plan.warnings.push(`Seed "${seed.field}" ignored: "${fileClass}" has no such field.`);
		return;
	}
	let value: string | string[] | undefined;
	if (seed.linkTo !== undefined) {
		const targets = (Array.isArray(seed.linkTo) ? seed.linkTo : [seed.linkTo]).map(linkTarget);
		const links: string[] = [];
		for (const target of targets) {
			if (!target) continue;
			const link = resolveLink(target);
			if (link) links.push(link);
			else plan.warnings.push(`Seed "${seed.field}": no note matches "${target}", so it was not linked.`);
		}
		if (links.length) value = Array.isArray(seed.linkTo) ? links : links[0];
	}
	if (value === undefined) {
		if (Array.isArray(seed.value)) value = seed.value.length ? [...seed.value] : undefined;
		else value = seed.value || undefined;
	}
	if (value === undefined) return;
	plan.writes.push({ field: seed.field, value: seed.list && !Array.isArray(value) ? [value] : value });
}
