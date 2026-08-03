/*
 * A stable string for a draft, for the cheapest possible "has this changed?".
 * No imports: an editing modal asks this on every keystroke, and the answer decides
 * whether closing the modal must stop and ask.
 */

/**
 * Key order is normalised, so re-entering the same values in another order is not
 * reported as a change — a warning that cries wolf gets ignored. List order is kept,
 * because there it means something.
 */
export function snapshot(value: unknown): string {
	return JSON.stringify(value, (_k, v) =>
		v && typeof v === "object" && !Array.isArray(v)
			? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort())
			: v
	);
}
