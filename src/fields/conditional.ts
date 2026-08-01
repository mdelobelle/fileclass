/*
 * Conditional (dependent) candidates (#19).
 *
 * A link field's candidate list can already be narrowed by another field of the
 * edited note — Fileclass runs the bound Base view with that note as context, so
 * `this.<Property>` resolves to its frontmatter. Writing it by hand means knowing
 * that, choosing between a value and a link comparison, remembering the
 * `.isTruthy()` guards, and adding a view. That is expert-only, and the classic
 * slip (`this.file.basename`, the note's *name*, instead of `this.<field>`, its
 * *value*) fails silently.
 *
 * So the author picks two things — the field to depend on, and the property to
 * match on the candidate side — and this builds the predicate. Pure: the text and
 * the names are decided here, the YAML is written elsewhere (conditionalView.ts).
 */
import { Field, FieldType } from "../schema/field";

/** Types whose value is a wikilink, and so need `file(…).basename` to compare. */
const LINK_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"File",
	"MultiFile",
	"Media",
	"MultiMedia",
]);

/**
 * Types that cannot be a source: their value is a list, and `==` would compare a
 * list to a scalar. Narrowing on "any of these" needs `contains`, which is a
 * different predicate and not offered yet.
 */
const MULTI_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"MultiFile",
	"MultiMedia",
	"Multi",
	"MultiInput",
	"CycleDuration",
	"ObjectList",
	"Canvas",
	"CanvasGroup",
	"CanvasGroupLink",
]);

export interface DependencyChoice {
	value: string;
	label: string;
}

/**
 * The fields offered as a source: single-valued ones, never the field being
 * edited (a field cannot narrow itself). A stored name that matches none of them
 * is kept and marked, so converting to a dropdown can't drop it — same rule as
 * the interval field.
 */
export function dependencyChoices(
	fields: readonly Pick<Field, "name" | "type">[],
	self: string,
	current?: string
): DependencyChoice[] {
	const eligible: DependencyChoice[] = [];
	const seen = new Set<string>();
	for (const field of fields) {
		const name = field.name?.trim();
		if (!name || name === self.trim() || MULTI_TYPES.has(field.type) || seen.has(name)) continue;
		seen.add(name);
		eligible.push({ value: name, label: `${name} (${field.type})` });
	}
	eligible.sort((a, b) => a.value.localeCompare(b.value));
	const choices: DependencyChoice[] = [{ value: "", label: "(none)" }, ...eligible];
	const stored = current?.trim();
	if (stored && !seen.has(stored)) choices.push({ value: stored, label: `${stored} (not found)` });
	return choices;
}

/** True when the pair is complete enough to generate anything. */
export function hasDependency(source?: string, match?: string): boolean {
	return !!source?.trim() && !!match?.trim();
}

export interface DependencySpec {
	/** Field of the edited note the candidates are filtered by. */
	source: string;
	/** Its type — decides value vs link comparison. */
	sourceType: FieldType;
	/** Property on the candidate side compared against the source's value. */
	match: string;
}

/**
 * The Bases formula that is true for a candidate matching the edited note.
 *
 * The guards are not decoration: `file(x).basename` on an empty value yields
 * null, so an unguarded comparison reduces to `null == null` — true — and the
 * picker would offer every candidate that is *also* empty. One guard per side,
 * so it reads as "only when the note has a value, match rows that share it".
 */
export function matchFormula({ source, sourceType, match }: DependencySpec): string {
	const left = match.trim();
	const right = `this.${source.trim()}`;
	const compare = LINK_TYPES.has(sourceType)
		? `file(${left}).basename == file(${right}).basename`
		: `${left} == ${right}`;
	return `${left}.isTruthy() && ${right}.isTruthy() && (${compare})`;
}

/** Bases identifiers are referenced as `formula.<name>`, so keep it to word chars. */
function identifier(text: string): string {
	return text.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Names come from the **predicate**, not from the field: two fields narrowed the
 * same way share one formula and one view, and renaming a field orphans nothing.
 */
export function formulaName(spec: Pick<DependencySpec, "source" | "match">): string {
	return `fcMatch_${identifier(spec.match)}_by_${identifier(spec.source)}`;
}

/**
 * The generated view's name — it reads as the source view plus the predicate it
 * applies, so two fields narrowing *different* scopes the same way don't collide.
 */
export function conditionalViewName(
	spec: Pick<DependencySpec, "source" | "match"> & { sourceView?: string }
): string {
	const scope = spec.sourceView?.trim();
	const predicate = `${spec.match.trim()} = this.${spec.source.trim()}`;
	return scope ? `Fileclass · ${scope} · ${predicate}` : `Fileclass · ${predicate}`;
}

/** True for a view name this feature generated (so the UI can say it owns it). */
export function isConditionalViewName(name: string): boolean {
	return name.trim().startsWith("Fileclass · ");
}
