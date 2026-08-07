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
	/** Fields merged in binding order; on the same key, the last bound class wins. */
	fields: Field[];
	source: BindingSource;
}

/**
 * A note tag and the tags it is nested under, most specific first:
 * `author/french/poetry` → `author/french/poetry`, `author/french`, `author`.
 *
 * Obsidian treats nested tags as a hierarchy everywhere else — tag search and the
 * tag pane include children — and so does Bases: `file.hasTag("author")` matches
 * `#author/french`. A class mapped on `author` therefore claims `#author/french`
 * too, which is what makes a generated view and the binding agree.
 */
export function tagAncestry(tag: string): string[] {
	const parts = tag.split("/").filter(Boolean);
	return parts.map((_, i) => parts.slice(0, parts.length - i).join("/"));
}

/** Bound fileClass names in priority order, keeping only those in the registry. */
function collectBoundNames(binding: FileBinding, registry: FileClassRegistry): string[] {
	const names: string[] = [];
	const add = (name: string | undefined) => {
		if (name && registry.has(name) && !names.includes(name)) names.push(name);
	};

	// 1. inner (frontmatter alias)
	binding.innerNames.forEach(add);
	// 2. tag match, a nested tag counting as its ancestors
	for (const tag of binding.tags) {
		for (const candidate of tagAncestry(tag)) add(registry.tagBindings.get(candidate));
	}
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

/**
 * What makes two declarations the same field on a note: its name at its level. Identical to
 * the key inheritance uses — a group's children are told apart by `path`, never by name
 * alone, or `editions.publisher` would collide with a plain `publisher`.
 */
function fieldKey(field: Field): string {
	// NUL as the separator, as in inheritance.ts: no path or name can hold one, so a field
	// called "next interval" can never blur into the path in front of it.
	return `${field.path}\u0000${field.name}`;
}

/**
 * The fields of every bound class, merged into one list.
 *
 * When two bound classes declare the same key, **the last one wins** — `fileClass: [Book,
 * Article]` reads as "a Book, and an Article on top", and the frontmatter has exactly one
 * `publisher` to write to. Before this, both survived (they were de-duplicated by *id*, and
 * two classes declare their own): a note showed two rows of the same name, reading the same
 * value through two different types, one of which would refuse it.
 *
 * The winner takes the loser's place in the list as well as its meaning, so the key sits with
 * the rest of the class that owns it and the row's stated owner matches where it appears.
 */
function mergeFields(names: string[], registry: FileClassRegistry): Field[] {
	const byKey = new Map<string, Field>();
	for (const name of names) {
		for (const field of registry.fieldsOf(name)) {
			const key = fieldKey(field);
			byKey.delete(key);
			byKey.set(key, field);
		}
	}
	return [...byKey.values()];
}

/**
 * Resolves a note's binding.
 *
 * The global fileClass is a **baseline, not a fallback**: it applies to every note, whatever
 * else that note is — the one template the whole vault carries. It was a last resort before,
 * reaching only notes with no binding at all, which meant the fields you wanted everywhere
 * were exactly the fields your typed notes never got.
 *
 * It comes **first** in the list, and the list is the precedence order — last declaration
 * wins — so a note's own classes override the baseline on any key they both declare, the same
 * rule that governs two classes on one note and a child against its parent. `source` still
 * says `global` when the baseline is all a note has, since that distinction is what tells a
 * note that names its class from one that inherited the vault's.
 *
 * Preset fields remain the last resort, for a vault with neither.
 */
export function resolveBinding(binding: FileBinding, registry: FileClassRegistry): Resolution {
	const own = collectBoundNames(binding, registry);
	const global = registry.globalFileClass;
	const withGlobal =
		global && registry.has(global) && !own.includes(global) ? [global, ...own] : own;

	if (withGlobal.length) {
		return {
			fileClassNames: withGlobal,
			fields: mergeFields(withGlobal, registry),
			source: own.length ? "fileClass" : "global",
		};
	}
	if (registry.presetFields?.length) {
		return { fileClassNames: [], fields: registry.presetFields, source: "preset" };
	}
	return { fileClassNames: [], fields: [], source: "none" };
}
