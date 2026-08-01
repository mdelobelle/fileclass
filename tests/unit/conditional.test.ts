/*
 * The generated predicate for a dependent field (#19). What matters here is what
 * the docs call the pitfalls: the guards that stop `null == null` from matching
 * everything, and the value-vs-link choice being made from the source's type.
 */
import { describe, expect, it } from "vitest";

import {
	conditionalViewName,
	dependencyChoices,
	formulaName,
	hasDependency,
	isConditionalViewName,
	matchFormula,
} from "../../src/fields/conditional";
import { FieldType } from "../../src/schema/field";

const f = (name: string, type: FieldType) => ({ name, type });

describe("dependencyChoices", () => {
	it("offers the class's single-valued fields, never the field itself", () => {
		const choices = dependencyChoices(
			[f("Goal", "File"), f("status", "Select"), f("Project", "File")],
			"Project"
		);
		expect(choices).toEqual([
			{ value: "", label: "(none)" },
			{ value: "Goal", label: "Goal (File)" },
			{ value: "status", label: "status (Select)" },
		]);
	});

	it("leaves out multi-valued sources — `==` can't compare a list to a scalar", () => {
		const choices = dependencyChoices(
			[f("tags", "Multi"), f("contributors", "MultiFile"), f("genre", "Select")],
			"cover"
		);
		expect(choices.map((c) => c.value)).toEqual(["", "genre"]);
	});

	it("keeps a stored name that matches nothing, so an edit can't drop it", () => {
		const choices = dependencyChoices([f("genre", "Select")], "cover", "renamed away");
		expect(choices.at(-1)).toEqual({ value: "renamed away", label: "renamed away (not found)" });
	});

	it("doesn't duplicate the stored name when it is a real candidate", () => {
		expect(dependencyChoices([f("genre", "Select")], "cover", "genre")).toHaveLength(2);
	});
});

describe("hasDependency", () => {
	it("needs both halves, and ignores whitespace", () => {
		expect(hasDependency("Goal", "Goal")).toBe(true);
		expect(hasDependency("Goal", "  ")).toBe(false);
		expect(hasDependency(undefined, "Goal")).toBe(false);
	});
});

describe("matchFormula", () => {
	it("compares links by basename when the source is a link field", () => {
		expect(matchFormula({ source: "Goal", sourceType: "File", match: "Goal" })).toBe(
			"Goal.isTruthy() && this.Goal.isTruthy() && (file(Goal).basename == file(this.Goal).basename)"
		);
	});

	it("compares values directly for everything else", () => {
		expect(matchFormula({ source: "genre", sourceType: "Select", match: "genre" })).toBe(
			"genre.isTruthy() && this.genre.isTruthy() && (genre == this.genre)"
		);
	});

	it("guards both sides — an unguarded comparison of two empties is true", () => {
		const formula = matchFormula({ source: "a", sourceType: "Input", match: "b" });
		expect(formula.startsWith("b.isTruthy() && this.a.isTruthy() &&")).toBe(true);
	});

	it("matches a differently named property on the candidate side", () => {
		expect(matchFormula({ source: "Goal", sourceType: "Select", match: "parentGoal" })).toBe(
			"parentGoal.isTruthy() && this.Goal.isTruthy() && (parentGoal == this.Goal)"
		);
	});

	it("trims what the author typed", () => {
		expect(matchFormula({ source: " Goal ", sourceType: "Select", match: " Goal " })).toBe(
			"Goal.isTruthy() && this.Goal.isTruthy() && (Goal == this.Goal)"
		);
	});
});

describe("names come from the predicate, not the field", () => {
	it("is stable for a given pair, so two fields share one formula", () => {
		const a = { source: "Goal", match: "Goal" };
		expect(formulaName(a)).toBe("fcMatch_Goal_by_Goal");
		expect(conditionalViewName(a)).toBe("Fileclass · Goal = this.Goal");
	});

	it("names the view after the scope it narrows, so two scopes don't collide", () => {
		expect(conditionalViewName({ source: "publisher", match: "publisher", sourceView: "All series" }))
			.toBe("Fileclass · All series · publisher = this.publisher");
		expect(conditionalViewName({ source: "publisher", match: "publisher", sourceView: "Comics" }))
			.toBe("Fileclass · Comics · publisher = this.publisher");
	});

	it("keeps a formula name to word characters", () => {
		expect(formulaName({ source: "my field!", match: "note.title" })).toBe(
			"fcMatch_note_title_by_my_field"
		);
	});

	it("recognises its own view names", () => {
		expect(isConditionalViewName("Fileclass · Goal = this.Goal")).toBe(true);
		expect(isConditionalViewName("Goal's projects")).toBe(false);
	});
});
