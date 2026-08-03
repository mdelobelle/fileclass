/*
 * fileClass inheritance (ARCHITECTURE.md §5, §10). Pure — single `extends`
 * chain with a cycle guard; `excludes` removes inherited fields. Semantics
 * ported from Metadata Menu's `getFileClassesAncestors` / `getAttributes`.
 */
import { Field } from "./field";

/**
 * Returns the ancestor chain of `name` (nearest parent first), following the
 * single `extends` link via `parentOf`. Stops on a missing parent, a
 * self-reference, or a cycle — so a misconfigured `extends` can never loop.
 */
export function computeAncestors(
	name: string,
	parentOf: (fileClassName: string) => string | undefined
): string[] {
	const ancestors: string[] = [];
	const seen = new Set<string>([name]);
	let current = parentOf(name);
	while (current && !seen.has(current)) {
		ancestors.push(current);
		seen.add(current);
		current = parentOf(current);
	}
	return ancestors;
}

/**
 * Resolves the full field set of a fileClass: its own fields plus inherited
 * ones, in declaration order (self first, then each ancestor), de-duplicated by
 * field **name** (the nearest declaration wins). `excludes` accumulate down the
 * chain: a class's excluded names are removed from that class and every deeper
 * ancestor (mirroring Metadata Menu, where a class may also exclude its own).
 */
export function resolveInheritedFields(
	name: string,
	ancestors: string[],
	ownFieldsOf: (fileClassName: string) => Field[],
	excludesOf: (fileClassName: string) => string[]
): Field[] {
	const excluded = new Set<string>(excludesOf(name));
	const result: Field[] = [];
	const seen = new Set<string>();

	for (const cls of [name, ...ancestors]) {
		for (const field of ownFieldsOf(cls)) {
			// Identity is name **and** level. A class's `fields[]` holds its nested
			// children flat, told apart only by `path`, so de-duplicating on the name
			// alone made a child vanish whenever a root field carried the same word —
			// `editions.publisher` beside a plain `publisher`, which is the natural way
			// to model a book. The child was dropped from the resolved set, so nothing
			// offered it when adding an item.
			const key = fieldKey(field);
			// Excludes name a field of a class, which is a root field: a group's children
			// go with their parent. Applying them at every level would drop
			// `editions.publisher` the day a class excludes an inherited `publisher`.
			if ((!field.path && excluded.has(field.name)) || seen.has(key)) continue;
			result.push(field);
			seen.add(key);
		}
		// Deeper ancestors also lose the names this class excludes.
		for (const ex of excludesOf(cls)) excluded.add(ex);
	}
	return result;
}

/**
 * What makes two declarations the same field: its name at its level. A nested child
 * shares the `path` of its parent's id, which an inheriting class inherits unchanged,
 * so overriding a child in a subclass still works.
 */
function fieldKey(field: Field): string {
	// NUL as the separator: no id, path or field name can contain one, so a name with
	// a space in it ("next interval") can never blur into the path in front of it.
	return `${field.path}\u0000${field.name}`;
}
