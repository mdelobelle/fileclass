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
 * Resolves the full field set of a fileClass: inherited fields first, then its own.
 *
 * The order runs **from the root of the chain down to the class itself** — `Media`'s fields, then
 * `Book`'s. That is the order the thing was built in, and it is what a reader expects on a note: the
 * general first, then what this class adds. Reversed, a `Book` note opened with its own fields and
 * buried `title` and `year` — declared once on `Media` and shared by everything — below them.
 *
 * De-duplicated by field name **and level**, and the **nearest declaration still wins**: a class
 * overriding an inherited field keeps that field where the ancestor put it, with its own definition.
 * Moving it to the end would mean overriding a field silently reordered the note.
 *
 * `excludes` accumulate down the chain: a class's excluded names are removed from that class and
 * every deeper ancestor (mirroring Metadata Menu, where a class may also exclude its own).
 */
export function resolveInheritedFields(
	name: string,
	ancestors: string[],
	ownFieldsOf: (fileClassName: string) => Field[],
	excludesOf: (fileClassName: string) => string[]
): Field[] {
	// Excludes are gathered walking *towards* the ancestors, because that is the direction they
	// travel in: what a class excludes, its ancestors lose. The emitted order is the other way
	// round, so each class's effective set is recorded here rather than recomputed there.
	const chain = [name, ...ancestors];
	const excludedAt = new Map<string, Set<string>>();
	const excluded = new Set<string>(excludesOf(name));
	for (const cls of chain) {
		excludedAt.set(cls, new Set(excluded));
		// Deeper ancestors also lose the names this class excludes.
		for (const ex of excludesOf(cls)) excluded.add(ex);
	}

	const result: Field[] = [];
	const at = new Map<string, number>();

	for (const cls of [...chain].reverse()) {
		const gone = excludedAt.get(cls) ?? new Set<string>();
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
			if (!field.path && gone.has(field.name)) continue;
			const seen = at.get(key);
			// Nearer classes come later in this walk, so an override replaces the ancestor's
			// definition **in place** — nearest wins, and the position is the ancestor's.
			if (seen !== undefined) result[seen] = field;
			else {
				at.set(key, result.length);
				result.push(field);
			}
		}
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
