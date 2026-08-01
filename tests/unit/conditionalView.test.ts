/*
 * Writing the generated formula + view into a parsed base (#19).
 *
 * The rule these guard came from a real miss: the first cut gave the generated view
 * the formula clause *alone*, and since `buildBaseYaml` puts the fileClass filter at
 * the view level (#55), the picker offered a comic whose publisher matched among the
 * series. The generated view must be the author's view, narrowed — never a new one.
 */
import { describe, expect, it } from "vitest";

import { ensureConditionalView } from "../../src/views/conditionalView";

const spec = {
	sourceViewName: "All series",
	formulaName: "fcMatch_publisher_by_publisher",
	formula: "publisher.isTruthy() && this.publisher.isTruthy() && (publisher == this.publisher)",
	viewName: "Fileclass · All series · publisher = this.publisher",
};

const sourceView = () => ({
	type: "table",
	name: "All series",
	filters: { and: ['fileClass == "Series"'] },
	sort: [{ property: "started", direction: "ASC" }],
	order: ["file.name", "publisher"],
});

describe("ensureConditionalView", () => {
	it("keeps the source view's scope and adds the formula", () => {
		const base: Record<string, unknown> = { views: [sourceView()] };
		expect(ensureConditionalView(base, spec)).toBe(true);
		const generated = (base.views as Record<string, unknown>[])[1];
		expect(generated).toEqual({
			type: "table",
			name: spec.viewName,
			filters: { and: ['fileClass == "Series"', `formula.${spec.formulaName} == true`] },
			sort: [{ property: "started", direction: "ASC" }],
			order: ["file.name", "publisher"],
		});
		expect(base.formulas).toEqual({ [spec.formulaName]: spec.formula });
	});

	it("refuses to generate without the source view — the scope would be lost", () => {
		const base: Record<string, unknown> = { views: [{ type: "table", name: "Something else" }] };
		ensureConditionalView(base, spec);
		const names = (base.views as { name: string }[]).map((v) => v.name);
		expect(names).toEqual(["Something else"]);
	});

	it("is idempotent: running twice changes nothing the second time", () => {
		const base: Record<string, unknown> = { views: [sourceView()] };
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect(ensureConditionalView(base, spec)).toBe(false);
		expect((base.views as unknown[]).length).toBe(2);
	});

	it("re-derives the view when the source view's own filters change", () => {
		const base: Record<string, unknown> = { views: [sourceView()] };
		ensureConditionalView(base, spec);
		(base.views as Record<string, unknown>[])[0].filters = {
			and: ['fileClass == "Series"', "started.isTruthy()"],
		};
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect((base.views as Record<string, unknown>[])[1].filters).toEqual({
			and: ['fileClass == "Series"', "started.isTruthy()", `formula.${spec.formulaName} == true`],
		});
	});

	it("wraps a source filter it cannot extend, keeping its meaning", () => {
		const base: Record<string, unknown> = {
			views: [{ type: "table", name: "All series", filters: { or: ["a", "b"] } }],
		};
		ensureConditionalView(base, spec);
		expect((base.views as Record<string, unknown>[])[1].filters).toEqual({
			and: [{ or: ["a", "b"] }, `formula.${spec.formulaName} == true`],
		});
	});

	it("updates the formula body in place when the mapping changes", () => {
		const base: Record<string, unknown> = { views: [sourceView()] };
		ensureConditionalView(base, spec);
		expect(ensureConditionalView(base, { ...spec, formula: "publisher == this.other" })).toBe(true);
		expect((base.formulas as Record<string, string>)[spec.formulaName]).toBe(
			"publisher == this.other"
		);
	});

	it("keeps the author's other formulas and views", () => {
		const base: Record<string, unknown> = {
			formulas: { titleWithSerie: "title + serie" },
			views: [sourceView(), { type: "cards", name: "Gallery", image: "cover", cardSize: 240 }],
		};
		ensureConditionalView(base, spec);
		expect(base.formulas).toEqual({
			titleWithSerie: "title + serie",
			[spec.formulaName]: spec.formula,
		});
		expect((base.views as { name: string }[])[1]).toEqual({
			type: "cards",
			name: "Gallery",
			image: "cover",
			cardSize: 240,
		});
	});

	it("keeps tuning added to the generated view, and re-derives the rest", () => {
		const base: Record<string, unknown> = { views: [sourceView()] };
		ensureConditionalView(base, spec);
		const generated = (base.views as Record<string, unknown>[])[1];
		generated.columnSize = { "file.name": 320 };
		generated.filters = { and: ["stale"] };
		expect(ensureConditionalView(base, spec)).toBe(true);
		expect(generated.columnSize).toEqual({ "file.name": 320 });
		expect(generated.filters).toEqual({
			and: ['fileClass == "Series"', `formula.${spec.formulaName} == true`],
		});
	});

	it("declines a value that isn't a base object", () => {
		expect(ensureConditionalView(null, spec)).toBe(false);
		expect(ensureConditionalView("nope", spec)).toBe(false);
	});
});
