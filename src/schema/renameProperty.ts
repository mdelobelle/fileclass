/*
 * Renaming a field renames the property it wrote.
 *
 * Renaming a definition used to touch the class note only: every note kept the old
 * key, with its value, and the new name simply had nothing under it — the field
 * looked empty while the data sat one line above under a name nothing knew about.
 *
 * Pure and order-preserving: frontmatter key order is what the operator sees in the
 * Properties panel, so a rename must not shuffle it.
 */

/** True for a YAML mapping — not a list, not a scalar, not null. */
function isMapping(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export interface RenameResult {
	/** The value with the key renamed wherever it was found. */
	value: unknown;
	/** How many keys were renamed — 0 means this note had nothing to migrate. */
	renamed: number;
}

/**
 * Renames `from` to `to` inside `value`, descending through `ancestors` first.
 *
 * An ancestor that holds a list — an `ObjectList` — is descended into item by item,
 * because each item carries the same child keys. A `to` that already exists is left
 * alone: overwriting a value the operator can see would be worse than doing nothing.
 */
export function renameProperty(
	value: unknown,
	ancestors: readonly string[],
	from: string,
	to: string
): RenameResult {
	if (Array.isArray(value)) {
		let renamed = 0;
		const items = value.map((item) => {
			const result = renameProperty(item, ancestors, from, to);
			renamed += result.renamed;
			return result.value;
		});
		return { value: items, renamed };
	}
	if (!isMapping(value)) return { value, renamed: 0 };

	if (ancestors.length) {
		const [head, ...rest] = ancestors;
		if (!(head in value)) return { value, renamed: 0 };
		const inner = renameProperty(value[head], rest, from, to);
		if (!inner.renamed) return { value, renamed: 0 };
		return { value: { ...value, [head]: inner.value }, renamed: inner.renamed };
	}

	if (!(from in value) || from === to || to in value) return { value, renamed: 0 };
	// Rebuilt in order, with the key swapped where it stood.
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value)) out[key === from ? to : key] = v;
	return { value: out, renamed: 1 };
}
