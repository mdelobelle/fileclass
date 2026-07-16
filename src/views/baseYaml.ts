/*
 * Generates the YAML of a `<fileClass>.base` file (ARCHITECTURE.md §11). Pure —
 * no Obsidian. A base filtered to the fileClass, with a table view listing the
 * class's fields. Keeps it minimal and deterministic (testable); users refine
 * the base afterwards in Obsidian.
 */

/** Quotes a value/property for the `order:` list only when it isn't a bare identifier. */
export function orderEntry(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : `note[${JSON.stringify(name)}]`;
}

interface BaseView {
	type?: unknown;
	name?: unknown;
	order?: unknown;
}
interface BaseObject {
	views?: unknown;
}

/** The `order` a managed view mirrors: `file.name` then the fileClass fields. */
export function mirrorOrder(fieldNames: string[]): string[] {
	return ["file.name", ...fieldNames.map(orderEntry)];
}

/**
 * True when the base's managed view (`viewName`) already mirrors the fields —
 * i.e. it exists, is a table, and its `order` equals `file.name` + the fields.
 * Used to report the sync status without writing.
 */
export function isBaseViewSynced(base: unknown, viewName: string, fieldNames: string[]): boolean {
	const views = (base as BaseObject)?.views;
	if (!Array.isArray(views)) return false;
	const view = (views as BaseView[]).find((v) => v?.type === "table" && v?.name === viewName);
	if (!view || !Array.isArray(view.order)) return false;
	const desired = mirrorOrder(fieldNames);
	return view.order.length === desired.length && view.order.every((v, i) => v === desired[i]);
}

/**
 * Mirrors the fileClass fields onto the base's **managed view** (the table view
 * named `viewName`), setting its `order` to exactly `file.name` + the fields.
 * Bijective — adds, removes, and reorders columns — because this view is owned
 * by Fileclass (the mirror is explicit via the fileClass's `baseFile` option).
 * Other views in the base are never touched. Mutates `base`; returns whether it
 * changed. Missing managed view is (re)created.
 */
export function mirrorBaseView(base: unknown, viewName: string, fieldNames: string[]): boolean {
	const b = base as BaseObject;
	if (!Array.isArray(b?.views)) return false; // malformed; the generator owns creation
	const views = b.views as BaseView[];
	const desired = mirrorOrder(fieldNames);

	const view = views.find((v) => v?.type === "table" && v?.name === viewName);
	if (!view) {
		views.push({ type: "table", name: viewName, order: desired });
		return true;
	}
	const current = Array.isArray(view.order) ? view.order : [];
	if (current.length === desired.length && current.every((v, i) => v === desired[i])) return false;
	view.order = desired;
	return true;
}

/**
 * Builds a `.base` YAML for `fileClassName`: `filters: <alias> == "name"`, and a
 * single table view (the managed view, named `viewName`, defaulting to the
 * fileClass name) listing `file.name` then the given field names.
 */
export function buildBaseYaml(
	fileClassName: string,
	rootFieldNames: string[],
	alias: string,
	viewName: string = fileClassName
): string {
	const order = ["file.name", ...rootFieldNames.map(orderEntry)];
	const lines = [
		"filters:",
		"  and:",
		`    - ${alias} == ${JSON.stringify(fileClassName)}`,
		"views:",
		"  - type: table",
		`    name: ${JSON.stringify(viewName)}`,
		"    order:",
		...order.map((o) => `      - ${o}`),
	];
	return lines.join("\n") + "\n";
}
