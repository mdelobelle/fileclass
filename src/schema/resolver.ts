/*
 * Binding resolver (ARCHITECTURE.md §10). Pure — decides which fileClass(es)
 * bind to a note and merges their fields, following Metadata Menu's priority:
 *
 *   frontmatter alias > tag > path > bookmark group > (base-view) > global > preset
 *
 * Base-view match (which replaces MDM's dataview `fileClassQueries`) needs the
 * Bases adapter and is wired in a later phase; the resolver exposes it as an
 * optional pre-resolved input (`baseViewNames`) so this module stays pure.
 */
import { Field } from "./field";

export interface FileBinding {
	/** fileClass names from the note's frontmatter alias (inner binding). */
	innerNames: string[];
	/** Tags on the note, without the leading "#". */
	tags: string[];
	/** Folder (parent) path of the note. */
	folderPath: string;
	/** Bookmark group paths containing the note (optional). */
	bookmarkGroups?: string[];
	/** fileClass names matched by a base view (optional, resolved upstream). */
	baseViewNames?: string[];
}

export interface FileClassRegistry {
	has(name: string): boolean;
	fieldsOf(name: string): Field[];
	/** tag → fileClass name (from `mapWithTag` / `tagNames`). */
	tagBindings: ReadonlyMap<string, string>;
	/** folder-path prefix → fileClass name (from `filesPaths`). */
	pathBindings: ReadonlyMap<string, string>;
	/** bookmark group → fileClass name (from `bookmarksGroups`). */
	bookmarkBindings: ReadonlyMap<string, string>;
	globalFileClass?: string;
	presetFields?: Field[];
}

export type BindingSource = "fileClass" | "global" | "preset" | "none";

export interface Resolution {
	/** Ordered, de-duplicated bound fileClass names (empty for global/preset). */
	fileClassNames: string[];
	/** Fields merged in priority order, de-duplicated by id. */
	fields: Field[];
	source: BindingSource;
}

/** Bound fileClass names in priority order, keeping only those in the registry. */
function collectBoundNames(binding: FileBinding, registry: FileClassRegistry): string[] {
	const names: string[] = [];
	const add = (name: string | undefined) => {
		if (name && registry.has(name) && !names.includes(name)) names.push(name);
	};

	// 1. inner (frontmatter alias)
	binding.innerNames.forEach(add);
	// 2. tag match
	binding.tags.forEach((tag) => add(registry.tagBindings.get(tag)));
	// 3. path match (folder path is under a mapped prefix)
	for (const [prefix, name] of registry.pathBindings) {
		if (binding.folderPath === prefix || binding.folderPath.startsWith(prefix)) add(name);
	}
	// 4. bookmark group match
	(binding.bookmarkGroups ?? []).forEach((group) => add(registry.bookmarkBindings.get(group)));
	// 5. base-view match (pre-resolved upstream)
	(binding.baseViewNames ?? []).forEach(add);

	return names;
}

/** Concatenates the fields of each bound class, de-duplicating by field id. */
function mergeFields(names: string[], registry: FileClassRegistry): Field[] {
	const fields: Field[] = [];
	const seen = new Set<string>();
	for (const name of names) {
		for (const field of registry.fieldsOf(name)) {
			if (seen.has(field.id)) continue;
			fields.push(field);
			seen.add(field.id);
		}
	}
	return fields;
}

/**
 * Resolves a note's binding. Falls back to the global fileClass, then to preset
 * fields, then to nothing — exactly as Metadata Menu's `getFilesFields`.
 */
export function resolveBinding(binding: FileBinding, registry: FileClassRegistry): Resolution {
	const names = collectBoundNames(binding, registry);
	if (names.length) {
		return { fileClassNames: names, fields: mergeFields(names, registry), source: "fileClass" };
	}
	const global = registry.globalFileClass;
	if (global && registry.has(global)) {
		return { fileClassNames: [global], fields: registry.fieldsOf(global), source: "global" };
	}
	if (registry.presetFields?.length) {
		return { fileClassNames: [], fields: registry.presetFields, source: "preset" };
	}
	return { fileClassNames: [], fields: [], source: "none" };
}
