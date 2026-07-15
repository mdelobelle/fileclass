/*
 * fileClass parsing (ARCHITECTURE.md §5, D3). Pure — takes a plain frontmatter
 * object (read elsewhere via metadataCache) and returns a normalized
 * ParsedFileClass. The file format is Metadata Menu's, unchanged; D1 options
 * (dvQueryString/customRendering/customSorting) are simply ignored here and
 * reported by the migration audit (§13), never acted upon.
 */
import { Field, parseRawField, RawField } from "./field";

export interface FileClassOptions {
	icon?: string;
	/** Parent fileClass name (frontmatter key `extends`), if any. */
	extends?: string;
	/** Field names to remove from inherited fields. */
	excludes: string[];
	mapWithTag: boolean;
	tagNames: string[];
	filesPaths: string[];
	bookmarksGroups: string[];
	version?: string;
	/** Preset display order of field ids. */
	fieldsOrder: string[];
}

export interface ParsedFileClass {
	name: string;
	/** Own fields only (inheritance is resolved by the index, §10). */
	fields: Field[];
	options: FileClassOptions;
	/** Non-fatal problems (unknown field types, malformed entries…). */
	errors: string[];
}

type Frontmatter = Record<string, unknown> | null | undefined;

/** Accepts an array, a comma-separated string, or nothing → string[]. */
export function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((v) => v != null).map((v) => String(v).trim());
	if (typeof value === "string" && value.trim()) {
		return value.split(",").map((v) => v.trim());
	}
	return [];
}

/** Coerces Metadata Menu's loose boolean encodings (true/"true"/1) to boolean. */
export function stringToBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return value.toLowerCase() === "true";
	return !!value;
}

/** Derives the fileClass name from its note path, given the class-files folder. */
export function fileClassNameFromPath(classFilesPath: string, path: string): string | undefined {
	if (!classFilesPath) return undefined;
	const folder = classFilesPath.endsWith("/") ? classFilesPath : `${classFilesPath}/`;
	if (!path.startsWith(folder) || !path.endsWith(".md")) return undefined;
	return path.slice(folder.length, -".md".length) || undefined;
}

/**
 * Parses a fileClass note's frontmatter into a ParsedFileClass. Never throws:
 * malformed field entries are collected in `errors` and skipped.
 */
export function parseFileClass(name: string, frontmatter: Frontmatter): ParsedFileClass {
	const fm = (frontmatter ?? {}) as Record<string, unknown>;
	const errors: string[] = [];

	const rawFields = Array.isArray(fm.fields) ? (fm.fields as RawField[]) : [];
	const fields: Field[] = [];
	for (const raw of rawFields) {
		const { field, error } = parseRawField(raw, name);
		if (error) errors.push(error);
		if (field) fields.push(field);
	}

	const extendsName =
		typeof fm.extends === "string" && fm.extends.trim() ? fm.extends.trim() : undefined;

	const options: FileClassOptions = {
		icon: typeof fm.icon === "string" && fm.icon ? fm.icon : undefined,
		extends: extendsName,
		excludes: toStringArray(fm.excludes),
		mapWithTag: stringToBoolean(fm.mapWithTag),
		tagNames: toStringArray(fm.tagNames),
		filesPaths: toStringArray(fm.filesPaths),
		bookmarksGroups: toStringArray(fm.bookmarksGroups),
		version: typeof fm.version === "string" ? fm.version : fm.version != null ? String(fm.version) : undefined,
		fieldsOrder: toStringArray(fm.fieldsOrder),
	};

	return { name, fields, options, errors };
}
