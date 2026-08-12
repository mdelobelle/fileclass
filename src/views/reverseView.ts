/*
 * The reverse-relation view (#154): from A1, the books whose `author` points at A1.
 *
 * The schema already describes that relation — `Book.author` draws its candidates from
 * `Authors.base#All authors` — but it is only navigable one way. This module authors the view
 * that reads it backwards. **Nothing is evaluated here and nothing is stored**: Fileclass writes
 * a filter, Bases answers it, exactly as with the dependent-field view (#19).
 *
 * Pure: no `obsidian` import, so every rule is unit-tested. The scanning, the file writes and the
 * "is it open in a tab" dance live in `reverseSync.ts`.
 *
 * **One view serves every host.** `this.file` inside an embedded base resolves to the note
 * holding the embed — measured on 1.13.2 and recorded in ARCHITECTURE §3.1 — so A1, A2 and A3
 * embed the *same* view and each sees its own rows. That is why the view's name must not mention
 * a host, and why reuse is the normal path rather than an optimisation.
 */
import { FieldType } from "../schema/field";
import { ClassScope, FilterClause, fileClassViewFilter, mirrorOrder } from "./baseYaml";

/** Link-ish field types, and whether one holds several values. */
const SINGLE: ReadonlySet<FieldType> = new Set<FieldType>(["File", "Media"]);
const MULTIPLE: ReadonlySet<FieldType> = new Set<FieldType>(["MultiFile", "MultiMedia"]);

export type LinkCardinality = "single" | "multiple";

/** The cardinality of a link field, or null when the type does not hold links. */
export function linkCardinality(type: FieldType): LinkCardinality | null {
	if (SINGLE.has(type)) return "single";
	if (MULTIPLE.has(type)) return "multiple";
	return null;
}

/**
 * The clause matching notes whose `field` points at the note hosting the embed.
 *
 * Both forms were verified over CDP against a plain link, an **aliased** link
 * (`[[A1|Melville]]`) and two notes sharing a basename in different folders — Bases resolves
 * links on both sides, so the alias matches and the namesakes stay apart (ARCHITECTURE §3.1).
 *
 * Two expressions, because there is no form that covers both cardinalities: `containsAny` returns
 * nothing on a scalar, `linksTo` and `==` return nothing on a list. And **never**
 * `field.contains(this.file.name)`: it reads as the obvious answer and matches a note pointing at
 * a *different* file with the same basename — measured, two rows where one was right.
 */
export function reverseClause(fieldName: string, cardinality: LinkCardinality): string {
	const property = fieldPath(fieldName);
	return cardinality === "single"
		? `${property} == this.file.asLink()`
		: `${property}.contains(this.file.asLink())`;
}

/**
 * A field name as a Bases property reference.
 *
 * A bare name works for a simple one; a name with a space or a dot needs the bracket form, which
 * is the notation Bases accepts in **filters** (§3.1 — `order:` is the opposite case).
 */
function fieldPath(fieldName: string): string {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName) ? fieldName : `note[${JSON.stringify(fieldName)}]`;
}

/**
 * A declared view reference — `Books.base#Book by author` — split into its two halves.
 *
 * One string rather than two keys, and deliberately the **embed's own syntax**: this is the form
 * the reader already writes in every note that shows the view, so a schema that names it the same
 * way reads as the same thing rather than as a second notation to learn.
 *
 * Null when there is no `#`: a base without a view names no relation, and guessing "the first view"
 * would be a decision taken on the reader's behalf about which relation they meant.
 */
export function parseViewRef(ref: string): { path: string; viewName: string } | null {
	const at = ref.indexOf("#");
	if (at <= 0) return null;
	const path = ref.slice(0, at).trim();
	const viewName = ref.slice(at + 1).trim();
	return path && viewName ? { path, viewName } : null;
}

/** The reverse of `parseViewRef`. */
export function formatViewRef(path: string, viewName: string): string {
	return `${path}#${viewName}`;
}

/** The declared view for a field, if the class declares one. */
export function relatedViewFor(
	entries: readonly { field: string; view: string }[],
	field: string
): { path: string; viewName: string } | null {
	const entry = entries.find((e) => e.field === field);
	return entry ? parseViewRef(entry.view) : null;
}

/**
 * The field a given view reads backwards, according to the class's own declarations.
 *
 * This is what lets a table know it is a reverse relation — and therefore what to seed — when its
 * name is `A's Bs` or anything else its author chose. The name is not consulted at all.
 */
export function fieldForView(
	entries: readonly { field: string; view: string }[],
	path: string,
	viewName: string
): string | undefined {
	return entries.find((e) => {
		const ref = parseViewRef(e.view);
		return ref && ref.path === path && ref.viewName === viewName;
	})?.field;
}

/**
 * The view's name: `Book by author`.
 *
 * Deliberately says the class and the field, and **not** the host note: one view answers for
 * every host, so a name like "A1's books" would be a lie on the second note and would leave a
 * base with one view per author. It is also the recognition key for reuse, so it must be derived
 * from the schema and nothing else.
 */
export function reverseViewName(targetClass: string, fieldName: string): string {
	return `${targetClass} by ${fieldName}`;
}

/** The embed a note carries to show that view. */
export function reverseEmbed(basePath: string, viewName: string): string {
	return `![[${basePath}#${viewName}]]`;
}

/**
 * The view Fileclass writes: the target class's own scope, plus the reverse clause.
 *
 * The class part comes from `fileClassPredicates`, so a class bound by folder or tag is scoped
 * the way its generated base is — filtering on the property alone would drop exactly the notes
 * take 034 had to fix in the generator.
 */
export function reverseViewFilter(
	scope: ClassScope,
	fieldName: string,
	cardinality: LinkCardinality
): { and: FilterClause[] } {
	// The very shape a managed view gets, plus one clause — the same composition #19 makes for a
	// dependent field, so a reader who has seen one filter recognises the other.
	return { and: [...fileClassViewFilter(scope).and, reverseClause(fieldName, cardinality)] };
}

/**
 * The columns of a reverse view: `columns`, without the pointing field, name first.
 *
 * That one column holds the host note on **every** row of a reverse table — it costs width and
 * says nothing, and width is scarce here: this table renders inside a note's body, not in a
 * full-width tab. Both notations are dropped, since a reader's own `order:` may carry either.
 *
 * Everything else is kept as given, formula columns included. The caller passes the class's
 * managed-view columns when it has one — the shape the reader already chose for that class — so a
 * Book table someone trimmed to four columns yields a reverse table of the same four.
 */
export function reverseOrder(columns: readonly string[], pointingField: string): string[] {
	const dropped = new Set([pointingField, `note.${pointingField}`, "file.name"]);
	return mirrorOrder(columns.filter((c) => !dropped.has(c)));
}

/** A view as it appears in a parsed `.base`. */
interface BaseView {
	type?: string;
	name?: string;
	filters?: unknown;
	order?: unknown;
	[key: string]: unknown;
}

interface BaseObject {
	views?: unknown;
	[key: string]: unknown;
}

/** True when the parsed base declares a view of that name. */
export function hasView(base: BaseObject, name: string): boolean {
	const views = Array.isArray(base.views) ? (base.views as BaseView[]) : [];
	return views.some((v) => v?.name === name);
}

/** A named view's `order`, if the base has that view and it declares one. */
export function viewOrder(base: BaseObject, name: string): string[] | null {
	const views = Array.isArray(base.views) ? (base.views as BaseView[]) : [];
	const order = views.find((v) => v?.name === name)?.order;
	return Array.isArray(order) && order.every((c) => typeof c === "string")
		? (order as string[])
		: null;
}

/**
 * Adds the reverse view to a parsed base, or reports that it is already there.
 *
 * Reuse first: a view with that name **is** the view, whatever the reader has done to its columns
 * or sort since. Its filter is left alone too — the same restraint `mirrorBaseView` shows about a
 * managed view's filters (§11). If they edited the filter, they meant to.
 *
 * Returns `"added"` or `"reused"`, so a caller can write the file only when there is something to
 * write and say which happened.
 */
export function addReverseView(
	base: BaseObject,
	name: string,
	filter: { and: FilterClause[] },
	order: string[]
): "added" | "reused" {
	const views = Array.isArray(base.views) ? (base.views as BaseView[]) : [];
	if (!Array.isArray(base.views)) base.views = views;
	if (hasView(base, name)) return "reused";
	views.push({ type: "fileclass-table", name, filters: filter, order });
	return "added";
}

/**
 * Where a note's body already embeds that view, or -1.
 *
 * The embed, once placed, is the reader's content: it is never rewritten and never duplicated —
 * a second run jumps to the line it finds. Matching is loose on purpose (any line mentioning the
 * base and the view) so an embed someone reformatted, aliased or wrapped still counts as present.
 */
export function findEmbedLine(body: string, basePath: string, viewName: string): number {
	const lines = body.split("\n");
	const base = basePath.replace(/\.base$/, "");
	return lines.findIndex(
		(line) => line.includes("![[") && line.includes(base) && line.includes(viewName)
	);
}

/**
 * The body with the embed appended, and the line it landed on.
 *
 * Used when no editor is open — with one, the caller inserts at the cursor instead, which is
 * where a reader expects a block they asked for. A trailing blank line is kept rather than
 * collapsed: the note's own formatting is not this feature's business.
 */
export function appendEmbed(body: string, embed: string): { body: string; line: number } {
	const trimmed = body.replace(/\s*$/, "");
	const prefix = trimmed ? `${trimmed}\n\n` : "";
	return { body: `${prefix}${embed}\n`, line: prefix.split("\n").length - 1 };
}
