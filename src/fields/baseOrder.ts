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

/** An item that may carry a group key (from a base view's `groupBy`, #47). */
export interface GroupableItem {
	display: string;
	/** Group key: a string, `null` for the keyless "no value" group, `undefined` = ungrouped. */
	group?: string | null;
}

/** A contiguous run of display strings sharing one group key. */
export interface DisplayGroup {
	key: string | null;
	values: string[];
}

/**
 * Collapses already group-ordered items into contiguous groups for display
 * (#47). Returns `undefined` when no item carries a group (the view has no
 * `groupBy`), so callers fall back to a flat list. Items must already be in
 * group order (as produced from a base view's `groups`).
 */
export function contiguousGroups(items: GroupableItem[]): DisplayGroup[] | undefined {
	if (!items.some((i) => i.group !== undefined)) return undefined;
	const out: DisplayGroup[] = [];
	for (const it of items) {
		const key = it.group ?? null;
		const last = out[out.length - 1];
		if (last && last.key === key) last.values.push(it.display);
		else out.push({ key, values: [it.display] });
	}
	return out;
}

/** Human label for a group key: the keyless group reads "(No value)". */
export function groupLabel(key: string | null): string {
	return key === null ? "(No value)" : key;
}
