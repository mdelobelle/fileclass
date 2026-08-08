/*
 * Frontmatter key order (#104). Pure — decides the order a note's keys *should* be in, and
 * says nothing about how to write them.
 *
 * The problem it answers: `processFrontMatter` appends new keys at the end
 * (ARCHITECTURE.md §3.2), so *Insert missing fields* lands them after whatever the note
 * already carried, and a field added to a class later lands last on every note that gets the
 * command run on it. The class knows the order — its `fields` array, reorderable in the
 * schema editor — and the fields modal and the generated view both honour it. The note's own
 * frontmatter was the one place that ignored it.
 *
 * Nothing here writes: `reorderPlan` returns the target order, or `null` when the keys are
 * already in it. That `null` is load-bearing — a reorder that rewrote every note on every
 * pass would be worse than the disorder it fixes.
 */
import { Field, isRootField } from "./field";

/** Where keys the class knows nothing about end up. */
export type UnknownKeysPosition = "top" | "bottom" | "keep-relative";

/**
 * A key YAML will reorder on its own, whatever we ask: Obsidian's writer sorts integer-like
 * keys numerically (§3.2), so a field named `2024` cannot be positioned. Reported rather than
 * silently producing an order the file will not keep.
 */
export function isIntegerLikeKey(key: string): boolean {
	return /^\d+$/.test(key);
}

/**
 * The order `keys` should be in for a note whose resolved fields are `fields`.
 *
 * Returns `null` when they are already in that order — the caller must then write nothing.
 * Every key present is present in the result exactly once: this plans a permutation, never
 * an insertion or a deletion.
 *
 * @param unknown where to put keys no field claims (`fileClass`, `tags`, `aliases`, anything
 *   hand-written). Default `"top"`, which is where those already sit in practice.
 */
export function reorderPlan(
	fields: readonly Field[],
	keys: readonly string[],
	unknown: UnknownKeysPosition = "top"
): string[] | null {
	const schemaOrder = fields.filter(isRootField).map((f) => f.name);
	const present = new Set(keys);

	// Known keys, in the class's order, keeping only those the note actually has. A field the
	// note does not carry is not inserted here: inserting is `insertMissingFields`' job, and
	// mixing the two would make a reorder add keys nobody asked for.
	const known: string[] = [];
	const claimed = new Set<string>();
	for (const name of schemaOrder) {
		if (present.has(name) && !claimed.has(name)) {
			known.push(name);
			claimed.add(name);
		}
	}
	const rest = keys.filter((k) => !claimed.has(k));

	const target =
		unknown === "top"
			? [...rest, ...known]
			: unknown === "bottom"
				? [...known, ...rest]
				: keepRelative(keys, claimed, known);

	// Same multiset, or the plan is a bug and the caller must not act on it.
	if (target.length !== keys.length) return null;
	return sameOrder(target, keys) ? null : target;
}

/**
 * `keep-relative`: every unknown key stays between the same neighbours it had, and only the
 * known keys are shuffled into the class's order, filling the slots they already occupied.
 */
function keepRelative(
	keys: readonly string[],
	claimed: ReadonlySet<string>,
	known: readonly string[]
): string[] {
	let next = 0;
	return keys.map((key) => (claimed.has(key) ? known[next++] : key));
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * The keys of `plan` that YAML will move anyway, so a caller can say so instead of promising
 * an order the file will not keep. Empty for the frontmatter of every normal note.
 */
export function unpositionableKeys(plan: readonly string[]): string[] {
	return plan.filter(isIntegerLikeKey);
}
