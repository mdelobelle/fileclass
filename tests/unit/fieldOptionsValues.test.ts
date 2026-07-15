import { describe, expect, it } from "vitest";

import { Field, FieldOptions } from "../../src/schema/field";
import { dateOptions, listOptions, numberOptions } from "../../src/fields/options";
import { resolveValues } from "../../src/fields/values";
import { displayValue } from "../../src/fields/display";

const make = (options: FieldOptions, type: Field["type"] = "Select"): Field => ({
	id: "i",
	name: "f",
	type,
	options,
	path: "",
	fileClassName: "FC",
});

describe("numberOptions", () => {
	it("coerces numeric strings and ignores junk", () => {
		expect(numberOptions(make({ step: "1", min: 0, max: "x" }, "Number"))).toEqual({
			step: 1,
			min: 0,
			max: undefined,
		});
	});
});

describe("listOptions", () => {
	it("treats a bare array as an inline values list", () => {
		expect(listOptions(make(["x", "y"])).valuesList).toEqual({ "1": "x", "2": "y" });
	});
	it("reads the structured MDM shape", () => {
		const o = listOptions(
			make({
				sourceType: "ValuesListNotePath",
				valuesList: { "1": "a" },
				valuesListNotePath: "L.md",
			})
		);
		expect(o.sourceType).toBe("ValuesListNotePath");
		expect(o.valuesListNotePath).toBe("L.md");
		expect(o.valuesList).toEqual({ "1": "a" });
	});
	it("defaults an unknown source to ValuesList", () => {
		expect(listOptions(make({ sourceType: "Weird" })).sourceType).toBe("ValuesList");
	});
});

describe("resolveValues", () => {
	it("returns inline list values", () => {
		expect(resolveValues(make(["a", "b"]))).toEqual(["a", "b"]);
	});
	it("reads note lines for a note-path source", () => {
		const field = make({ sourceType: "ValuesListNotePath", valuesListNotePath: "L.md" });
		const reader = () => [" one ", "", "two"];
		expect(resolveValues(field, reader)).toEqual(["one", "two"]);
	});
	it("is unconstrained for a note-path source without a reader", () => {
		const field = make({ sourceType: "ValuesListNotePath", valuesListNotePath: "L.md" });
		expect(resolveValues(field)).toEqual([]);
	});
	it("is unconstrained for a dataview/base source", () => {
		expect(resolveValues(make({ sourceType: "ValuesFromDVQuery" }))).toEqual([]);
	});
});

describe("dateOptions", () => {
	it("reads format and link options", () => {
		expect(dateOptions(make({ dateFormat: "YYYY", defaultInsertAsLink: "true" }, "Date"))).toEqual(
			{ dateFormat: "YYYY", defaultInsertAsLink: true, dateLinkPath: undefined }
		);
	});
});

describe("displayValue", () => {
	it("joins multi values and stringifies scalars", () => {
		expect(displayValue(make([], "Multi"), ["a", "b"])).toBe("a, b");
		expect(displayValue(make([], "Boolean"), true)).toBe("true");
		expect(displayValue(make([], "Input"), 5)).toBe("5");
		expect(displayValue(make([], "Input"), undefined)).toBe("");
	});
});
