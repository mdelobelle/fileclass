/*
 * Choices for "Next interval field". The interesting cases are the ones a plain
 * "filter by type" would get wrong: a stored name that matches nothing must
 * survive, and a name declared twice (inherited then overridden) must appear once.
 */
import { describe, expect, it } from "vitest";

import { intervalFieldChoices, isIntervalField } from "../../src/fields/intervalChoices";
import { FieldType } from "../../src/schema/field";

const f = (name: string, type: FieldType) => ({ name, type });

describe("isIntervalField", () => {
	it("accepts the two duration types and nothing else", () => {
		expect(isIntervalField(f("a", "Duration"))).toBe(true);
		expect(isIntervalField(f("a", "CycleDuration"))).toBe(true);
		for (const type of ["Date", "Input", "Number", "Select"] as FieldType[]) {
			expect(isIntervalField(f("a", type)), type).toBe(false);
		}
	});
});

describe("intervalFieldChoices", () => {
	it("offers none plus the compatible fields, labelled with their type", () => {
		const choices = intervalFieldChoices([
			f("published", "Date"),
			f("next interval", "CycleDuration"),
			f("runtime", "Duration"),
			f("pages", "Number"),
		]);
		expect(choices).toEqual([
			{ value: "", label: "(none)" },
			{ value: "next interval", label: "next interval (CycleDuration)" },
			{ value: "runtime", label: "runtime (Duration)" },
		]);
	});

	it("is just (none) when the class has no interval field", () => {
		expect(intervalFieldChoices([f("published", "Date")])).toEqual([
			{ value: "", label: "(none)" },
		]);
	});

	it("keeps a stored name that matches nothing, so an edit can't drop it", () => {
		const choices = intervalFieldChoices([f("runtime", "Duration")], "renamed away");
		expect(choices.at(-1)).toEqual({ value: "renamed away", label: "renamed away (not found)" });
	});

	it("doesn't duplicate the stored name when it is a real candidate", () => {
		const choices = intervalFieldChoices([f("runtime", "Duration")], "runtime");
		expect(choices).toHaveLength(2);
		expect(choices.filter((c) => c.value === "runtime")).toHaveLength(1);
	});

	it("lists a name declared twice — inherited then overridden — once", () => {
		const choices = intervalFieldChoices([
			f("next interval", "Duration"),
			f("next interval", "CycleDuration"),
		]);
		expect(choices).toHaveLength(2);
		expect(choices[1].value).toBe("next interval");
	});

	it("ignores a blank or whitespace name, and trims the stored one", () => {
		expect(intervalFieldChoices([f("  ", "Duration")])).toHaveLength(1);
		expect(intervalFieldChoices([], "  spaced  ").at(-1)?.value).toBe("spaced");
	});

	it("treats a blank stored value as none", () => {
		expect(intervalFieldChoices([], "   ")).toEqual([{ value: "", label: "(none)" }]);
	});
});
