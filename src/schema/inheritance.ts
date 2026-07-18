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
	const seenNames = new Set<string>();

	for (const cls of [name, ...ancestors]) {
		for (const field of ownFieldsOf(cls)) {
			if (excluded.has(field.name) || seenNames.has(field.name)) continue;
			result.push(field);
			seenNames.add(field.name);
		}
		// Deeper ancestors also lose the names this class excludes.
		for (const ex of excludesOf(cls)) excluded.add(ex);
	}
	return result;
}
