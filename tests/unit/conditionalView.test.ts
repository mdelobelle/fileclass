/*
 * Writing the generated formula + view into a parsed base (#19). The rule under
 * test is restraint: converge on regeneration, and leave everything the author
 * wrote — other views, other formulas, and the tuning inside our own view.
 */
import { describe, expect, it } from "vitest";

import { ensureConditionalView } from "../../src/views/conditionalView";

const spec = {
	formulaName: "fcMatch_Goal_by_Goal",
	formula: "Goal.isTruthy() && this.Goal.isTruthy() && (Goal == this.Goal)",
	viewName: "Fileclass · Goal = this.Goal",
};

describe("ensureConditionalView", () => {
	it("adds the formula and the view to a base that has neither", () => {
		const base: Record<string, unknown> = { views: [{ type: "table", name: "All projects" }] };
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect(base.formulas).toEqual({ [spec.formulaName]: spec.formula });
		expect(base.views).toEqual([
			{ type: "table", name: "All projects" },
			{
				type: "table",
				name: spec.viewName,
				filters: { and: [`formula.${spec.formulaName} == true`] },
			},
		]);
	});

	it("is idempotent: running twice changes nothing the second time", () => {
		const base: Record<string, unknown> = { views: [] };
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect(ensureConditionalView(base, spec)).toBe(false);
		expect((base.views as unknown[]).length).toBe(1);
	});

	it("updates the formula body in place when the mapping changes", () => {
		const base: Record<string, unknown> = { views: [] };
		ensureConditionalView(base, spec);
		const changed = ensureConditionalView(base, { ...spec, formula: "Goal == this.Other" });
		expect(changed).toBe(true);
		expect((base.formulas as Record<string, string>)[spec.formulaName]).toBe("Goal == this.Other");
	});

	it("keeps the author's other formulas and views", () => {
		const base: Record<string, unknown> = {
			formulas: { titleWithSerie: "title + serie" },
			views: [{ type: "cards", name: "Gallery", image: "cover", cardSize: 240 }],
		};
		ensureConditionalView(base, spec);
		expect(base.formulas).toEqual({
			titleWithSerie: "title + serie",
			[spec.formulaName]: spec.formula,
		});
		expect((base.views as { name: string }[])[0]).toEqual({
			type: "cards",
			name: "Gallery",
			image: "cover",
			cardSize: 240,
		});
	});

	it("keeps the tuning inside its own view, and only re-points the filter", () => {
		const base: Record<string, unknown> = {
			views: [
				{
					type: "table",
					name: spec.viewName,
					filters: { and: ["formula.stale == true"] },
					order: ["file.name", "Goal"],
					columnSize: { "file.name": 320 },
				},
			],
		};
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect((base.views as Record<string, unknown>[])[0]).toEqual({
			type: "table",
			name: spec.viewName,
			filters: { and: [`formula.${spec.formulaName} == true`] },
			order: ["file.name", "Goal"],
			columnSize: { "file.name": 320 },
		});
	});

	it("initialises a views list when the base has none", () => {
		const base: Record<string, unknown> = {};
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect(Array.isArray(base.views)).toBe(true);
		expect((base.views as unknown[]).length).toBe(1);
	});

	it("declines a value that isn't a base object", () => {
		expect(ensureConditionalView(null, spec)).toBe(false);
		expect(ensureConditionalView("nope", spec)).toBe(false);
	});
});
