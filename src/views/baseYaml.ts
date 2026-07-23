/*
 * Generates the YAML of a `<fileClass>.base` file (ARCHITECTURE.md §11). Pure —
 * no Obsidian. A base filtered to the fileClass, with an editable
 * `fileclass-table` view listing the class's fields. Keeps it minimal and
 * deterministic (testable); users refine the base afterwards in Obsidian.
 */
import { FILECLASS_TABLE_VIEW } from "./columns";

/**
 * YAML-quotes a field name for the manual `order:` text when it isn't a bare
 * identifier. The order entry is the **bare property name** (Bases prefixes it
 * with `note.`); a `note[...]` form is wrong there — Bases would re-prefix it to
 * `note.note["…"]` (issue #37). The bracket form is only for filters/formulas.
 */
export function yamlScalar(name: string): string {
	return /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name);
}

interface BaseView {
	type?: unknown;
	name?: unknown;
	order?: unknown;
}
interface BaseObject {
	views?: unknown;
}

/** A managed (Fileclass) table view — native `table` or editable `fileclass-table`. */
function isManagedTable(view: BaseView, viewName: string): boolean {
	return (
		view?.name === viewName &&
		(view?.type === "table" || view?.type === FILECLASS_TABLE_VIEW)
	);
}

/**
 * The `order` a managed view mirrors: `file.name` then the fileClass fields, as
 * **bare property names** — the value Bases parses (and normalizes to
 * `note.<name>`) and the value `parseYaml` yields on re-read, so sync comparison
 * is stable. YAML quoting is a serialization concern handled by `stringifyYaml`
 * (sync path) or `yamlScalar` (create path).
 */
export function mirrorOrder(fieldNames: string[]): string[] {
	return ["file.name", ...fieldNames];
}

/**
 * True when the base's managed view (`viewName`) already mirrors the fields —
 * i.e. it exists, is a table, and its `order` equals `file.name` + the fields.
 * Used to report the sync status without writing.
 */
export function isBaseViewSynced(base: unknown, viewName: string, fieldNames: string[]): boolean {
	const views = (base as BaseObject)?.views;
	if (!Array.isArray(views)) return false;
	const view = (views as BaseView[]).find((v) => isManagedTable(v, viewName));
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

	const view = views.find((v) => isManagedTable(v, viewName));
	if (!view) {
		views.push({ type: FILECLASS_TABLE_VIEW, name: viewName, order: desired });
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
	const lines = [
		"filters:",
		"  and:",
		`    - ${alias} == ${JSON.stringify(fileClassName)}`,
		"views:",
		`  - type: ${FILECLASS_TABLE_VIEW}`,
		`    name: ${JSON.stringify(viewName)}`,
		"    order:",
		"      - file.name",
		...rootFieldNames.map((n) => `      - ${yamlScalar(n)}`),
	];
	return lines.join("\n") + "\n";
}
