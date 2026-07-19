/* Minimal, dependency-free output helpers. */

const cell = (v: unknown): string =>
	v === null || v === undefined ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v);

/** Renders rows as an aligned text table. `columns` sets order (else union of keys). */
export function table(rows: readonly object[], columns?: string[]): string {
	if (!rows.length) return "(no results)";
	const recs = rows as readonly Record<string, unknown>[];
	const cols = columns ?? [...new Set(recs.flatMap((r) => Object.keys(r)))];
	const widths = cols.map((c) => Math.max(c.length, ...recs.map((r) => cell(r[c]).length)));
	const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join("  ").trimEnd();
	return [
		line(cols),
		widths.map((w) => "-".repeat(w)).join("  "),
		...recs.map((r) => line(cols.map((c) => cell(r[c])))),
	].join("\n");
}

export function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}
