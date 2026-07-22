/*
 * Field model (ARCHITECTURE.md §5, §7). Pure — zero Obsidian imports, fully
 * unit-tested. The fileClass file format is Metadata Menu's, unchanged (D3):
 * fields are frontmatter objects `{ name, id, type, options, path }`, with
 * `path` encoding nesting as parent field ids joined by "____".
 */

/** Nesting separator used inside a field `path` (Metadata Menu convention). */
export const PATH_SEPARATOR = "____";

/**
 * All field types recognized by the fileClass format. Behavior for each type
 * lands in later phases (§7 waves); P1 only needs to parse them without loss.
 */
export const FIELD_TYPES = [
	"Input",
	"MultiInput",
	"Number",
	"Select",
	"Cycle",
	"Boolean",
	"Date",
	"DateTime",
	"Time",
	"Duration",
	"CycleDuration",
	"Location",
	"Icon",
	"Multi",
	"File",
	"MultiFile",
	"Media",
	"MultiMedia",
	"Canvas",
	"CanvasGroup",
	"CanvasGroupLink",
	"Formula",
	"Lookup",
	"JSON",
	"YAML",
	"Object",
	"ObjectList",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const KNOWN_TYPES = new Set<string>(FIELD_TYPES);

/** Field options are either a plain values list or a structured record. */
export type FieldOptions = string[] | Record<string, unknown>;

export interface Field {
	id: string;
	name: string;
	type: FieldType;
	/** Raw options as stored in frontmatter (values list or structured record). */
	options: FieldOptions;
	/** "" for a root field; otherwise parent field ids joined by "____". */
	path: string;
	/** Name of the fileClass declaring this field. */
	fileClassName: string;
}

/** Shape of a raw `fields[]` entry before validation. */
export interface RawField {
	name?: unknown;
	id?: unknown;
	type?: unknown;
	options?: unknown;
	path?: unknown;
}

/** Uppercases the first character (Metadata Menu's `capitalize`). */
export function capitalize(s: string): string {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function isFieldType(value: string): value is FieldType {
	return KNOWN_TYPES.has(value);
}

/** Nesting depth: 0 for a root field, 1 for a direct child, etc. */
export function fieldLevel(path: string): number {
	return path ? path.split(PATH_SEPARATOR).length : 0;
}

export function isRootField(field: Pick<Field, "path">): boolean {
	return !field.path;
}

/** Id of the immediate parent field, or undefined for a root field. */
export function parentFieldId(path: string): string | undefined {
	if (!path) return undefined;
	const segments = path.split(PATH_SEPARATOR);
	return segments[segments.length - 1];
}

/** The `path` value a direct child of `parent` must carry. */
export function childPathOf(parent: Pick<Field, "id" | "path">): string {
	return parent.path ? `${parent.path}${PATH_SEPARATOR}${parent.id}` : parent.id;
}

/** Direct child fields of an Object/ObjectList field, in declaration order. */
export function childFieldsOf(allFields: Field[], parent: Field): Field[] {
	const childPath = childPathOf(parent);
	return allFields.filter((f) => f.path === childPath);
}

/**
 * Normalizes a values-list option to a `{ "0": v0, "1": v1 }` record (as
 * Metadata Menu does for Select/Cycle/Multi sources). Records pass through.
 */
export function normalizeListOptions(options: FieldOptions): Record<string, string> {
	if (Array.isArray(options)) {
		const record: Record<string, string> = {};
		options.forEach((opt, index) => {
			record[index] = String(opt);
		});
		return record;
	}
	const record: Record<string, string> = {};
	for (const [key, value] of Object.entries(options)) record[key] = String(value);
	return record;
}

export interface ParsedFieldResult {
	field?: Field;
	error?: string;
}

/**
 * Validates and normalizes one raw `fields[]` entry. Never throws (legacy
 * fileClasses must not crash the index, §17): a malformed entry yields an
 * `error` and no field; an unknown type is coerced to "Input" with an error.
 */
export function parseRawField(raw: RawField, fileClassName: string): ParsedFieldResult {
	if (typeof raw?.name !== "string" || !raw.name) {
		return { error: `${fileClassName}: a field is missing its "name"` };
	}
	if (typeof raw.id !== "string" || !raw.id) {
		return { error: `${fileClassName}: field "${raw.name}" is missing its "id"` };
	}
	const rawType = typeof raw.type === "string" ? capitalize(raw.type) : "Input";
	let error: string | undefined;
	let type: FieldType;
	if (isFieldType(rawType)) {
		type = rawType;
	} else {
		type = "Input";
		error = `${fileClassName}: field "${raw.name}" has unknown type "${raw.type}" (treated as Input)`;
	}
	const options: FieldOptions =
		Array.isArray(raw.options) || (raw.options && typeof raw.options === "object")
			? (raw.options as FieldOptions)
			: [];
	const path = typeof raw.path === "string" ? raw.path : "";
	return { field: { id: raw.id, name: raw.name, type, options, path, fileClassName }, error };
}
