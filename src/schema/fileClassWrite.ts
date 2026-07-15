/*
 * Pure transforms for authoring a fileClass definition (ARCHITECTURE.md §20).
 * No Obsidian: they mutate the raw `fields[]` array and produce the option
 * key/values, preserving each field entry's unknown keys (D5). The Obsidian
 * write layer (fileClassIo.ts) applies these inside a single processFrontMatter.
 */

/** A raw `fields[]` entry; extra keys (options, command, display…) are kept. */
export interface RawFieldEntry {
	name?: string;
	id?: string;
	type?: string;
	path?: string;
	options?: unknown;
	[key: string]: unknown;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A 6-char alphanumeric field id, unique against `existing` (Metadata Menu style). */
export function generateFieldId(
	existing: ReadonlySet<string> = new Set(),
	rand: () => number = Math.random
): string {
	const make = () =>
		Array.from({ length: 6 }, () => ID_ALPHABET[Math.floor(rand() * ID_ALPHABET.length)]).join("");
	let id = make();
	for (let guard = 0; existing.has(id) && guard < 10000; guard++) id = make();
	return id;
}

export function collectFieldIds(fields: RawFieldEntry[]): Set<string> {
	return new Set(fields.filter((f) => typeof f.id === "string").map((f) => f.id as string));
}

/** Appends a new field definition; returns the created entry. */
export function addFieldDef(
	fields: RawFieldEntry[],
	def: { name: string; type: string; path?: string },
	existingIds: Set<string> = collectFieldIds(fields)
): RawFieldEntry {
	const entry: RawFieldEntry = {
		name: def.name,
		id: generateFieldId(existingIds),
		type: def.type,
		options: [],
		path: def.path ?? "",
	};
	fields.push(entry);
	return entry;
}

/** Mutates the matching entry's name/type in place (keeps its other keys). */
export function updateFieldDef(
	fields: RawFieldEntry[],
	id: string,
	changes: { name?: string; type?: string }
): void {
	const field = fields.find((f) => f.id === id);
	if (!field) return;
	if (changes.name !== undefined) field.name = changes.name;
	if (changes.type !== undefined) field.type = changes.type;
}

export function removeFieldDef(fields: RawFieldEntry[], id: string): void {
	const index = fields.findIndex((f) => f.id === id);
	if (index >= 0) fields.splice(index, 1);
}

/** Swaps a field with its neighbor (`dir` = -1 up, +1 down). */
export function moveFieldDef(fields: RawFieldEntry[], id: string, dir: -1 | 1): void {
	const i = fields.findIndex((f) => f.id === id);
	if (i < 0) return;
	const j = i + dir;
	if (j < 0 || j >= fields.length) return;
	[fields[i], fields[j]] = [fields[j], fields[i]];
}

/** The editable fileClass options (a subset of FileClassOptions). */
export interface EditableOptions {
	icon?: string;
	extends?: string;
	limit?: number;
	mapWithTag?: boolean;
	tagNames?: string[];
	filesPaths?: string[];
	bookmarksGroups?: string[];
	excludes?: string[];
}

/**
 * Builds the frontmatter key/values to write for the options (empty lists and
 * blank scalars become `null`, mirroring Metadata Menu's `updateOptions`).
 * `fields`, `version`, `fieldsOrder`, and saved views are left untouched.
 */
export function buildOptionUpdates(o: EditableOptions): Record<string, unknown> {
	const list = (v?: string[]) => (v && v.length ? v : null);
	return {
		icon: o.icon?.trim() ? o.icon.trim() : null,
		extends: o.extends?.trim() ? o.extends.trim() : null,
		limit: typeof o.limit === "number" && Number.isFinite(o.limit) ? o.limit : null,
		mapWithTag: !!o.mapWithTag,
		tagNames: list(o.tagNames),
		filesPaths: list(o.filesPaths),
		bookmarksGroups: list(o.bookmarksGroups),
		excludes: list(o.excludes),
	};
}
