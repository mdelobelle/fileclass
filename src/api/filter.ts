/*
 * Pure predicate for API-2 filters (list/bulk). No Obsidian — unit-testable.
 * A filter tests one field's value; scalars compare as strings, arrays (Multi)
 * are tested by membership with `contains`.
 */
export type FilterOp = "is" | "isNot" | "contains" | "isEmpty" | "isNotEmpty";

export interface Filter {
	field: string;
	op: FilterOp;
	value?: unknown;
}

export function isEmptyValue(v: unknown): boolean {
	return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function equals(v: unknown, target: unknown): boolean {
	return String(v ?? "") === String(target ?? "");
}

function contains(v: unknown, target: unknown): boolean {
	const t = String(target ?? "");
	if (Array.isArray(v)) return v.map((x) => String(x)).includes(t);
	if (typeof v === "string") return v.includes(t);
	return false;
}

/** Does `fieldValue` (the note's value for `filter.field`) satisfy `filter`? */
export function matchesFilter(fieldValue: unknown, filter: Filter): boolean {
	switch (filter.op) {
		case "isEmpty":
			return isEmptyValue(fieldValue);
		case "isNotEmpty":
			return !isEmptyValue(fieldValue);
		case "is":
			return equals(fieldValue, filter.value);
		case "isNot":
			return !equals(fieldValue, filter.value);
		case "contains":
			return contains(fieldValue, filter.value);
	}
}
