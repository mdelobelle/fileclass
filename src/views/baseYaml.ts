/*
 * Generates the YAML of a `<fileClass>.base` file (ARCHITECTURE.md §11). Pure —
 * no Obsidian. An editable `fileclass-table` view listing the class's fields,
 * filtered to the fileClass **at the view level** (issue #55) so a base can
 * hold extra views for other fileClasses without the class filter shadowing
 * them. Bases ANDs base-level and view-level filters, so a view-level filter is
 * equivalent for the managed view while leaving other views free. Keeps it
 * minimal and deterministic (testable); users refine the base afterwards in
 * Obsidian.
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
	filters?: unknown;
}
interface BaseObject {
	views?: unknown;
}

/**
 * Everything that binds a note to a fileClass and can be expressed as a Bases
 * predicate. A class bound by folder or by tag leaves **no `fileClass` property**
 * on its notes, so a view filtered on the property alone returns nothing — which
 * is what a generated base did for every folder-mapped class.
 *
 * Bookmark groups and Base views also bind (`bookmarksGroups`, and a class named
 * by a view) and have no equivalent Bases predicate; notes bound only that way
 * are outside the generated filter, and the docs say so.
 */
export interface ClassScope {
	/** The frontmatter property naming a class — the `fileClassAlias` setting. */
	alias: string;
	name: string;
	/** Tags that bind: `tagNames`, plus the class name itself when `mapWithTag`. */
	tags?: readonly string[];
	/** Folders whose notes bind — subfolders included, as binding is by prefix. */
	folders?: readonly string[];
}

/** A view filter is a clause or a nested boolean group. */
export type FilterClause = string | { or: string[] };

/**
 * The clause matching notes that name the class in frontmatter, e.g.
 * `fileClass.containsAny("Book")`.
 *
 * `containsAny`, not `==`: a note may carry **several** classes, and then the property is a
 * YAML list, which no equality test matches. Measured on the demo vault's generated Book view —
 * 8 rows against 9, with *As We May Think* (`fileClass: [Book, Article]`) missing from the table
 * of a class it belongs to. `containsAny` matches the scalar case too, verified on the same view
 * (every single-class note kept its row), so one clause covers both.
 */
export function fileClassFilterClause(alias: string, fileClassName: string): string {
	return `${alias}.containsAny(${JSON.stringify(fileClassName)})`;
}

/**
 * What the clause above used to be, and still is in every base generated before this version.
 *
 * Kept so `isGeneratedScopeFilter` recognises those filters as ours: a sync then repairs them
 * in place. Treating them as hand-written would be the worse failure — the filter that loses
 * multi-class notes would be preserved out of politeness.
 */
function legacyFileClassFilterClause(alias: string, fileClassName: string): string {
	return `${alias} == ${JSON.stringify(fileClassName)}`;
}

/**
 * Every predicate that selects a note of this class, property first.
 *
 * `file.inFolder()` rather than `file.folder ==` because binding is by prefix: a
 * note in `Authors/Deep/` is bound by `filesPaths: [Authors]`, and an equality
 * test on the folder would leave it out (measured: 6 rows instead of 7). Tags
 * containing whitespace are skipped, matching the resolver — they never bind.
 */
export function fileClassPredicates(scope: ClassScope): string[] {
	const clauses = [fileClassFilterClause(scope.alias, scope.name)];
	for (const folder of scope.folders ?? []) {
		const path = folder.trim().replace(/\/+$/, "");
		if (path) clauses.push(`file.inFolder(${JSON.stringify(path)})`);
	}
	for (const tag of scope.tags ?? []) {
		const name = tag.trim().replace(/^#/, "");
		if (name && !/\s/u.test(name)) clauses.push(`file.hasTag(${JSON.stringify(name)})`);
	}
	return clauses;
}

/**
 * The view-level filter object Fileclass owns on a managed view (issue #55).
 * One predicate stays a plain clause; several become an `or` group nested in the
 * `and`, which is where a dependent field's predicate is appended (#19).
 */
export function fileClassViewFilter(scope: ClassScope): { and: FilterClause[] } {
	const clauses = fileClassPredicates(scope);
	return { and: clauses.length > 1 ? [{ or: clauses }] : clauses };
}

/**
 * True when a managed view's `filters` is one Fileclass wrote and nobody edited:
 * the legacy single property clause, or an `or` group of nothing but generated
 * predicates. Anything else is the user's, and is never overwritten.
 */
export function isGeneratedScopeFilter(filters: unknown, scope: ClassScope): boolean {
	const group: unknown = (filters as { and?: unknown } | null)?.and;
	// `Array.isArray` widens an `unknown` to `any[]`, which is how an `any` would
	// creep into a file that forbids it — hence the explicit `unknown[]` casts.
	if (!Array.isArray(group) || (group as unknown[]).length !== 1) return false;
	const only: unknown = (group as unknown[])[0];
	if (typeof only === "string") {
		return (
			only === fileClassFilterClause(scope.alias, scope.name) ||
			only === legacyFileClassFilterClause(scope.alias, scope.name)
		);
	}
	if (!only || typeof only !== "object" || Object.keys(only).length !== 1) return false;
	const clauses: unknown = (only as { or?: unknown }).or;
	if (!Array.isArray(clauses)) return false;
	const alias = escapeForRegExp(scope.alias);
	const generated = new RegExp(
		`^(?:${alias}\\.containsAny\\(|${alias} == |file\\.inFolder\\(|file\\.hasTag\\()`
	);
	return (clauses as unknown[]).every((c) => typeof c === "string" && generated.test(c));
}

function escapeForRegExp(source: string): string {
	return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A value a view's filter pins down, and how the field stores it. */
export interface FilterValue {
	field: string;
	value: string;
	/** True when the clause was a containment test, so the value belongs in a list. */
	list: boolean;
}

/**
 * The field values a view's filter **fixes**, for a note created from that view.
 *
 * A `Todo` table filters `status == "Todo"`; a note made from it that did not carry that status
 * would vanish from the table that created it, which is a strange thing for a button to do. So the
 * filter's own equalities become the new note's starting values.
 *
 * Only clauses that fix **one** value: `field == "x"`, and a single-argument `contains`/`containsAny`
 * for a list field, and only where the filter *requires* them — never under an `or` or a `not`, where
 * a clause offers a possibility rather than a fact. Everything else — `!=`, `>`, `isEmpty()`, two
 * candidates — narrows without deciding, and a button that guessed there would be inventing data.
 *
 * `fieldNames` scopes it to the class's own fields, which also keeps the class clause
 * (`fileClass.containsAny(…)`) out: the binding is written separately and is not a field value.
 */
export function fieldValuesInFilter(filters: unknown, fieldNames: readonly string[]): FilterValue[] {
	const wanted = new Set(fieldNames);
	const out: FilterValue[] = [];
	const seen = new Set<string>();
	const add = (field: string, value: string, list: boolean): void => {
		const name = field.replace(/^note\./, "");
		if (!wanted.has(name) || seen.has(name)) return;
		seen.add(name);
		out.push({ field: name, value, list });
	};
	const equality = /(?:^|[\s(])((?:note\.)?[A-Za-z_][\w .-]*?)\s*==\s*"([^"]+)"/g;
	const contains = /(?:^|[\s(])((?:note\.)?[A-Za-z_][\w .-]*?)\.contains(?:Any)?\(([^)]*)\)/g;
	const quoted = /"([^"]+)"/g;
	const walk = (node: unknown, fixed: boolean): void => {
		if (typeof node === "string") {
			// `||` inside one clause is the same choice an `or` group makes, and decides nothing.
			if (!fixed || node.includes("||")) return;
			equality.lastIndex = 0;
			for (let m = equality.exec(node); m; m = equality.exec(node)) add(m[1].trim(), m[2], false);
			contains.lastIndex = 0;
			for (let m = contains.exec(node); m; m = contains.exec(node)) {
				const values: string[] = [];
				quoted.lastIndex = 0;
				for (let q = quoted.exec(m[2]); q; q = quoted.exec(m[2])) values.push(q[1]);
				// One value only: `containsAny("a", "b")` accepts either, and picking one would be a
				// coin toss written into somebody's note.
				if (values.length === 1) add(m[1].trim(), values[0], true);
			}
			return;
		}
		if (Array.isArray(node)) {
			node.forEach((child) => walk(child, fixed));
			return;
		}
		if (node && typeof node === "object") {
			for (const [key, child] of Object.entries(node)) {
				// **Nothing under an `or` is fixed.** A real vault filters `Ongoing` as four equalities
				// on `Status` in an `or`; taking the first would make every note created there a
				// "WaitingFor", which is one of the four and not the one anybody asked for.
				walk(child, fixed && key !== "or" && key !== "not");
			}
		}
	};
	walk(filters, true);
	return out;
}

/**
 * The fileClasses a view's filter names outright, through the alias.
 *
 * A view's **filter** says what it is about far more reliably than its rows do: rows resolve to
 * nothing when the view is empty, and to several classes as soon as one note carries two. The clause
 * is there in both cases, which is what lets the toolbar answer for a `Todo`, an `Ongoing` and a
 * `Done` view of one class without any of them being declared anywhere.
 *
 * Both spellings, since a hand-written base may use either: `fileClass.containsAny("Book")` and
 * `fileClass == "Book"`. Nested groups are walked, because a status clause usually sits in an `and`
 * beside the class one.
 */
export function classesNamedInFilter(filters: unknown, alias: string): string[] {
	const escaped = escapeForRegExp(alias);
	// `containsAny` takes **several** names — `containsAny("Book", "Comic")` is one clause about two
	// classes. Reading only the first said "this is a Book table", which would have put a wrong
	// `New Book` on a table about both; the call's whole argument list is read.
	const containsAny = new RegExp(`${escaped}\\.containsAny\\(([^)]*)\\)`, "g");
	const equality = new RegExp(`${escaped}\\s*==\\s*"([^"]+)"`, "g");
	const quoted = /"([^"]+)"/g;
	const found = new Set<string>();
	const walk = (node: unknown): void => {
		if (typeof node === "string") {
			containsAny.lastIndex = 0;
			for (let m = containsAny.exec(node); m; m = containsAny.exec(node)) {
				quoted.lastIndex = 0;
				for (let q = quoted.exec(m[1]); q; q = quoted.exec(m[1])) found.add(q[1]);
			}
			equality.lastIndex = 0;
			for (let m = equality.exec(node); m; m = equality.exec(node)) found.add(m[1]);
			return;
		}
		if (Array.isArray(node)) node.forEach(walk);
		else if (node && typeof node === "object") Object.values(node).forEach(walk);
	};
	walk(filters);
	return [...found];
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
 * A column a sync must leave exactly where it is: `formula.*` and `file.*`.
 *
 * Those two families are safe to recognise by prefix because they **cannot be a field column** — a
 * field's column is a bare property name or `note.<name>`, never prefixed that way. A bare column
 * over a property no class declares is *not* kept, and that is deliberate: it cannot be told apart
 * from the leftover of a field the class used to have, and resurrecting those forever is worse than
 * dropping one somebody added by hand. That same rule is what makes removing a field remove its
 * column.
 */
export function isKeptColumn(column: string): boolean {
	return column.startsWith("formula.") || column.startsWith("file.");
}

/** The kept columns of an order, in the order they appear. */
export function keptColumns(order: readonly unknown[]): string[] {
	return order.filter((c): c is string => typeof c === "string" && isKeptColumn(c));
}

/**
 * The order a managed view should have, given the order it has.
 *
 * **Positions are the reader's, the field sequence is the class's.** Every `file.*` and `formula.*`
 * column stays in the slot it occupies; the remaining slots are filled with the class's fields, in
 * the class's order — the same contract the note-fields modal keeps, so one rule covers every surface
 * (§11). Those two families are additions made for *reading*, not for editing, which is why they are
 * left alone and the fields are not. So a `formula.Room` sitting third stays third, and a `file.mtime` between two
 * fields stays between two fields — which the previous version got wrong by rebuilding the order as
 * "name, fields, then the rest", moving columns nobody asked to move.
 *
 * Fields the view had no slot for are appended; slots left over when a class has fewer fields than
 * the view had simply close up. Idempotent: run it on its own output and nothing moves.
 *
 * `file.name` is prepended when the order does not mention it at all — a managed table without the
 * note's name is almost always an accident, and a new view gets it first from `mirrorOrder`.
 */
export function mergeOrder(existing: readonly unknown[], fieldNames: readonly string[]): string[] {
	const pending = [...fieldNames];
	const out: string[] = [];
	for (const raw of existing) {
		if (typeof raw !== "string") continue;
		if (isKeptColumn(raw)) {
			out.push(raw);
			continue;
		}
		// A field slot: it takes the next field the class declares, whatever used to sit here.
		const next = pending.shift();
		if (next !== undefined) out.push(next);
	}
	out.push(...pending);
	if (!out.includes("file.name")) out.unshift("file.name");
	return out;
}

/**
 * True when the base's managed view (`viewName`) already mirrors the fields — it exists, is a table,
 * and its `order` already holds the class's fields, in the class's order, around whatever `file.*`
 * and `formula.*` columns the reader placed. Used to report the sync status without writing.
 */
export function isBaseViewSynced(
	base: unknown,
	viewName: string,
	fieldNames: string[],
	scope?: ClassScope
): boolean {
	const views = (base as BaseObject)?.views;
	if (!Array.isArray(views)) return false;
	const view = (views as BaseView[]).find((v) => isManagedTable(v, viewName));
	if (!view || !Array.isArray(view.order)) return false;
	// Mapping a class to a folder changes no field, so comparing columns alone
	// reported "synced" while the view filtered on a property those notes don't
	// have — the Sync button stayed disabled over a view returning nothing.
	if (
		scope &&
		isGeneratedScopeFilter(view.filters, scope) &&
		JSON.stringify(view.filters) !== JSON.stringify(fileClassViewFilter(scope))
	) {
		return false;
	}
	const desired = mergeOrder(view.order, fieldNames);
	return view.order.length === desired.length && view.order.every((v, i) => v === desired[i]);
}

/**
 * Mirrors the fileClass fields onto the base's **managed view** (the table view
 * named `viewName`), setting its `order` to exactly `file.name` + the fields.
 * Bijective — adds, removes, and reorders columns — because this view is owned
 * by Fileclass (the mirror is explicit via the fileClass's `baseFile` option).
 * Other views in the base are never touched (issue #55: never move a legacy
 * base-wide filter). A **newly created** managed view gets the view-level scope
 * filter; an **existing** one keeps its filters unless they are still exactly what
 * Fileclass generated, in which case they are brought up to date — that is how a
 * base created before its class was mapped to a folder starts returning rows.
 * A hand-edited filter is left alone. Mutates `base`; returns whether it changed.
 */
export function mirrorBaseView(
	base: unknown,
	viewName: string,
	fieldNames: string[],
	scope: ClassScope
): boolean {
	const b = base as BaseObject;
	if (!Array.isArray(b?.views)) return false; // malformed; the generator owns creation
	const views = b.views as BaseView[];
	const filters = fileClassViewFilter(scope);

	const view = views.find((v) => isManagedTable(v, viewName));
	if (!view) {
		views.push({ type: FILECLASS_TABLE_VIEW, name: viewName, filters, order: mirrorOrder(fieldNames) });
		return true;
	}
	let changed = false;
	if (
		isGeneratedScopeFilter(view.filters, scope) &&
		JSON.stringify(view.filters) !== JSON.stringify(filters)
	) {
		view.filters = filters;
		changed = true;
	}
	const current = Array.isArray(view.order) ? view.order : [];
	// Computed from what is there, so the reader's own columns keep both their existence and their
	// place, and only the field sequence is brought back to the class's.
	const desired = mergeOrder(current, fieldNames);
	if (current.length !== desired.length || current.some((v, i) => v !== desired[i])) {
		view.order = desired;
		changed = true;
	}
	return changed;
}

/**
 * Builds a `.base` YAML for `fileClassName`: a single table view (the managed
 * view, named `viewName`, defaulting to the fileClass name) filtered to the
 * fileClass **at the view level** (`filters: <alias> == "name"`, issue #55) and
 * listing `file.name` then the given field names. No base-wide filter, so extra
 * views for other fileClasses can be added without being shadowed.
 */
export function buildBaseYaml(
	scope: ClassScope,
	rootFieldNames: string[],
	viewName: string = scope.name
): string {
	const clauses = fileClassPredicates(scope);
	const lines = [
		"views:",
		`  - type: ${FILECLASS_TABLE_VIEW}`,
		`    name: ${JSON.stringify(viewName)}`,
		"    filters:",
		"      and:",
		// One predicate reads better inline; several go in an `or` group, the shape
		// a dependent field then appends its own clause beside (#19).
		...(clauses.length > 1
			? ["        - or:", ...clauses.map((c) => `            - ${c}`)]
			: [`        - ${clauses[0]}`]),
		"    order:",
		"      - file.name",
		...rootFieldNames.map((n) => `      - ${yamlScalar(n)}`),
	];
	return lines.join("\n") + "\n";
}
