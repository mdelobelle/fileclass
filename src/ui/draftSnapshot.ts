/*
 * A stable string for a draft, for the cheapest possible "has this changed?".
 * No imports: an editing modal asks this on every keystroke, and the answer decides
 * whether closing the modal must stop and ask.
 */

/** True for a YAML-ish mapping: not a list, not a scalar, not null. */
function isMapping(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Key order is normalised, so re-entering the same values in another order is not
 * reported as a change — a warning that cries wolf gets ignored. List order is kept,
 * because there it means something.
 *
 * The replacer is typed rather than inferred: `JSON.stringify` hands it `any`, and
 * returning that unchecked is exactly what this repo's lint forbids.
 */
export function snapshot(value: unknown): string {
	const normalise = (_key: string, v: unknown): unknown =>
		isMapping(v) ? Object.fromEntries(Object.entries(v).sort()) : v;
	return JSON.stringify(value, normalise);
}
