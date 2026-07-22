import { describe, expect, it } from "vitest";

import { Field, FieldType, FieldOptions } from "../../src/schema/field";
import { hasAllowedValues, isListType, validateField } from "../../src/fields/validate";

const make = (type: FieldType, options: FieldOptions = []): Field => ({
	id: "i",
	name: "f",
	type,
	options,
	path: "",
	fileClassName: "FC",
});

describe("validateField — empty is always valid", () => {
	it("accepts undefined/null/empty for any type", () => {
		for (const t of ["Input", "Number", "Boolean", "Select", "Multi", "Date"] as FieldType[]) {
			expect(validateField(make(t), undefined).ok).toBe(true);
			expect(validateField(make(t), "").ok).toBe(true);
		}
	});
});

describe("Number", () => {
	it("accepts numbers and numeric strings", () => {
		expect(validateField(make("Number"), 42).ok).toBe(true);
		expect(validateField(make("Number"), "3.14").ok).toBe(true);
	});
	it("rejects non-numbers and booleans", () => {
		expect(validateField(make("Number"), "abc").ok).toBe(false);
		expect(validateField(make("Number"), true).ok).toBe(false);
	});
	it("enforces min/max", () => {
		const f = make("Number", { min: 1, max: 10 });
		expect(validateField(f, 0).ok).toBe(false);
		expect(validateField(f, 11).ok).toBe(false);
		expect(validateField(f, 5).ok).toBe(true);
	});
});

describe("Boolean", () => {
	it("accepts booleans and 'true'/'false'", () => {
		expect(validateField(make("Boolean"), true).ok).toBe(true);
		expect(validateField(make("Boolean"), "false").ok).toBe(true);
	});
	it("rejects other values", () => {
		expect(validateField(make("Boolean"), "yes").ok).toBe(false);
	});
});

describe("Select / Cycle membership", () => {
	it("is unconstrained when no allowed values are given", () => {
		expect(validateField(make("Select"), "anything", []).ok).toBe(true);
	});
	it("enforces membership when a list is provided", () => {
		const allowed = ["a", "b"];
		expect(validateField(make("Select"), "a", allowed).ok).toBe(true);
		expect(validateField(make("Cycle"), "c", allowed).ok).toBe(false);
	});
});

describe("Multi", () => {
	it("requires a list and validates each item", () => {
		const allowed = ["a", "b"];
		expect(validateField(make("Multi"), "a", allowed).ok).toBe(false); // not a list
		expect(validateField(make("Multi"), ["a", "b"], allowed).ok).toBe(true);
		expect(validateField(make("Multi"), ["a", "z"], allowed).ok).toBe(false);
	});
});

describe("MultiInput", () => {
	it("requires a list of scalar items (no allowed-values constraint)", () => {
		expect(validateField(make("MultiInput"), "x").ok).toBe(false); // not a list
		expect(validateField(make("MultiInput"), []).ok).toBe(true);
		expect(validateField(make("MultiInput"), ["a", "b"]).ok).toBe(true);
		expect(validateField(make("MultiInput"), ["a", 2]).ok).toBe(true); // any scalar
		expect(validateField(make("MultiInput"), [{ a: 1 }]).ok).toBe(false); // object item
	});
	it("empty is valid unless required", () => {
		expect(validateField(make("MultiInput"), []).ok).toBe(true);
		expect(validateField(make("MultiInput", { required: true }), []).ok).toBe(true); // [] is not empty
		expect(validateField(make("MultiInput", { required: true }), undefined).ok).toBe(false);
	});
});

describe("Duration / MultiDuration", () => {
	it("Duration accepts an RFC 5545 duration, rejects junk", () => {
		expect(validateField(make("Duration"), "P1W").ok).toBe(true);
		expect(validateField(make("Duration"), "PT1H30M").ok).toBe(true);
		expect(validateField(make("Duration"), "3 days").ok).toBe(false);
		expect(validateField(make("Duration"), "").ok).toBe(true); // optional
	});
	it("MultiDuration requires a list of valid durations", () => {
		expect(validateField(make("MultiDuration"), "P1W").ok).toBe(false); // not a list
		expect(validateField(make("MultiDuration"), ["P1D", "P2W"]).ok).toBe(true);
		expect(validateField(make("MultiDuration"), ["P1D", "oops"]).ok).toBe(false);
		expect(validateField(make("MultiDuration"), []).ok).toBe(true);
	});
});

describe("Date / DateTime / Time patterns", () => {
	it("validates default formats", () => {
		expect(validateField(make("Date"), "2026-07-15").ok).toBe(true);
		expect(validateField(make("Date"), "15/07/2026").ok).toBe(false);
		expect(validateField(make("DateTime"), "2026-07-15T09:30").ok).toBe(true);
		expect(validateField(make("Time"), "9:30").ok).toBe(true);
		expect(validateField(make("Time"), "0930").ok).toBe(false);
	});
	it("accepts any non-empty value when a custom format is set", () => {
		const f = make("Date", { dateFormat: "DD/MM/YYYY" });
		expect(validateField(f, "15/07/2026").ok).toBe(true);
	});
	it("accepts the insert-as-link wikilink form", () => {
		expect(validateField(make("Date"), "[[2026-07-15]]").ok).toBe(true);
		expect(validateField(make("Date"), "[[Journal/2026-07-15]]").ok).toBe(true);
		expect(validateField(make("DateTime"), "[[2026-07-15T09:30|note]]").ok).toBe(true);
	});
});

describe("Input", () => {
	it("accepts scalars, rejects objects", () => {
		expect(validateField(make("Input"), "text").ok).toBe(true);
		expect(validateField(make("Input"), 5).ok).toBe(true);
		expect(validateField(make("Input"), { a: 1 }).ok).toBe(false);
	});
});

describe("required", () => {
	it("empty is valid unless required", () => {
		expect(validateField(make("Input"), "").ok).toBe(true);
		expect(validateField(make("Input", { required: true }), "").ok).toBe(false);
		expect(validateField(make("Input", { required: true }), undefined).ok).toBe(false);
		expect(validateField(make("Input", { required: "true" }), "").ok).toBe(false);
	});
	it("a present value on a required field still validates by type", () => {
		expect(validateField(make("Input", { required: true }), "ok").ok).toBe(true);
		expect(validateField(make("Number", { required: true }), "x").ok).toBe(false);
	});
});

describe("type predicates — list vs choice", () => {
	it("isListType is the multi-valued types (array-valued)", () => {
		expect(["Multi", "MultiInput", "MultiDuration", "MultiFile", "MultiMedia"].every((t) => isListType(t as FieldType))).toBe(true);
		expect(isListType("Select")).toBe(false);
		expect(isListType("Input")).toBe(false);
		expect(isListType("Cycle")).toBe(false);
	});
	it("hasAllowedValues is Select/Cycle/Multi (validated against a values list)", () => {
		expect(["Select", "Cycle", "Multi"].every((t) => hasAllowedValues(t as FieldType))).toBe(true);
		expect(hasAllowedValues("MultiFile")).toBe(false); // draws from candidates, not a list
		expect(hasAllowedValues("Input")).toBe(false);
	});
});
