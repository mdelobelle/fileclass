/*
 * Writing the generated formula and view into a parsed `.base` (#19).
 *
 * The generated view is a **narrowed copy of the view the author chose**, not a
 * view of its own: it keeps that view's filters, order and sort, and adds the
 * formula clause. Anything else would drop the scope those filters carry — a first
 * cut filtered on the formula alone, and since `buildBaseYaml` puts the fileClass
 * filter at the *view* level (issue #55), the picker happily offered a comic whose
 * publisher matched among the series.
 *
 * Same restraint as mirrorBaseView otherwise: other views, other formulas and the
 * author's tuning are left exactly as they are. Pure over the parsed object — the
 * file I/O and the "is it open in a tab" dance live in conditionalSync.ts.
 */

interface BaseView {
	type?: string;
	name?: string;
	filters?: unknown;
	[key: string]: unknown;
}

interface BaseObject {
	formulas?: Record<string, unknown>;
	views?: unknown;
	[key: string]: unknown;
}

/** The clause the generated view adds to whatever the source view already filters. */
function formulaClause(formula: string): string {
	return `formula.${formula} == true`;
}

/**
 * The source view's filters with the formula clause added.
 *
 * A view may carry no filters, an `and`/`or` object, or a bare list; only the `and`
 * case can be extended in place. Anything else is wrapped, so an `or` group keeps
 * its meaning: `and: [ <the or group>, <the formula> ]`.
 */
function narrowedFilters(source: unknown, formula: string): { and: unknown[] } {
	const clause = formulaClause(formula);
	if (!source) return { and: [clause] };
	if (typeof source === "object" && source !== null && Array.isArray((source as { and?: unknown[] }).and)) {
		const existing = ((source as { and: unknown[] }).and ?? []).filter((c) => c !== clause);
		return { and: [...existing, clause] };
	}
	return { and: [source, clause] };
}

export interface ConditionalViewSpec {
	/** The view the author picked — the candidate scope to narrow. */
	sourceViewName: string;
	/** Formula key, referenced by the generated view's filter. */
	formulaName: string;
	/** The formula body. */
	formula: string;
	/** Name of the generated view the field will point at. */
	viewName: string;
}

/**
 * Ensures `base` carries the formula and the narrowed view. Mutates it; returns
 * whether anything changed, so a caller can skip a pointless write.
 *
 * Regenerating converges: the view is rebuilt from the current source view and
 * predicate rather than duplicated.
 */
export function ensureConditionalView(base: unknown, spec: ConditionalViewSpec): boolean {
	const b = base as BaseObject;
	if (!b || typeof b !== "object") return false;
	let changed = false;

	b.formulas ??= {};
	if (b.formulas[spec.formulaName] !== spec.formula) {
		b.formulas[spec.formulaName] = spec.formula;
		changed = true;
	}

	if (!Array.isArray(b.views)) {
		b.views = [];
		changed = true;
	}
	const views = b.views as BaseView[];
	const source = views.find((v) => v?.name === spec.sourceViewName);
	// Without the source view there is no scope to inherit — the formula alone would
	// widen the list to the whole vault, which is the bug this shape exists to fix.
	if (!source) return changed;

	const desired: BaseView = {
		...source,
		name: spec.viewName,
		filters: narrowedFilters(source.filters, spec.formulaName),
	};
	const existing = views.find((v) => v?.name === spec.viewName);
	if (!existing) {
		views.push(desired);
		return true;
	}
	// Keep what the author tuned *on the generated view* (column widths, say) and
	// re-derive only what the predicate and the source view decide.
	const merged: BaseView = { ...existing, ...desired };
	if (JSON.stringify(existing) !== JSON.stringify(merged)) {
		Object.assign(existing, merged);
		changed = true;
	}
	return changed;
}
