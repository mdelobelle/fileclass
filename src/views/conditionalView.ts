/*
 * Writing the generated formula and view into a parsed `.base` (#19).
 *
 * Same discipline as mirrorBaseView: touch only what this feature owns, leave
 * every other view, filter and formula exactly as the author left them. Pure over
 * the parsed object — the file I/O and the "is it open in a tab" dance live in
 * baseSync.ts, and this stays testable without a vault.
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

/** The filter a generated view carries: its own formula, and nothing else. */
function conditionalFilter(formula: string): { and: string[] } {
	return { and: [`formula.${formula} == true`] };
}

export interface ConditionalViewSpec {
	/** Formula key, referenced by the view's filter. */
	formulaName: string;
	/** The formula body. */
	formula: string;
	/** Name of the view the field will point at. */
	viewName: string;
}

/**
 * Ensures `base` carries the formula and the view. Mutates it; returns whether
 * anything changed, so a caller can skip a pointless write.
 *
 * An existing view of that name is **updated in place** (its filter re-pointed at
 * the formula) rather than duplicated: regenerating after changing the mapping has
 * to converge, not accumulate.
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
	const view = views.find((v) => v?.name === spec.viewName);
	if (!view) {
		views.push({
			type: "table",
			name: spec.viewName,
			filters: conditionalFilter(spec.formulaName),
		});
		return true;
	}
	// The name comes from the predicate, so a view of this name is ours; keep its
	// other keys (order, sort, columnSize — whatever the author tuned) and only
	// make sure the filter still points at the current formula.
	const desired = conditionalFilter(spec.formulaName);
	if (JSON.stringify(view.filters) !== JSON.stringify(desired)) {
		view.filters = desired;
		changed = true;
	}
	return changed;
}
