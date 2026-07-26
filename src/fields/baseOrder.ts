/*
 * Pure helpers for turning ordered base rows into candidate displays / allowed
 * values (issue #47). No Obsidian — the row *order* is produced upstream by
 * getBaseRows (the view's sort + group flow, canary-verified); these only map
 * that order into what the pickers show, so they stay unit-testable.
 */

/** A base row reduced to the column values a picker reads. */
export interface ValueRow {
	values: Record<string, string | null>;
}

/**
 * The display string for a row: its `displayColumn` value when that column is
 * set and non-empty, otherwise the fallback (usually the file name).
 */
export function rowDisplay(row: ValueRow, displayColumn: string | undefined, fallback: string): string {
	return (displayColumn ? row.values[displayColumn] : null) ?? fallback;
}

/** Distinct non-empty values of `column` across rows, in first-seen (view) order. */
export function distinctColumnValues(rows: ValueRow[], column: string): string[] {
	const seen = new Set<string>();
	for (const row of rows) {
		const v = row.values[column];
		if (v != null && v !== "") seen.add(v);
	}
	return [...seen];
}
