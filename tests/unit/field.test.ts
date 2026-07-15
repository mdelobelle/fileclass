import { describe, expect, it } from "vitest";

import {
	capitalize,
	fieldLevel,
	isRootField,
	normalizeListOptions,
	parentFieldId,
	parseRawField,
} from "../../src/schema/field";

describe("parseRawField", () => {
	it("parses a valid field and capitalizes the type", () => {
		const { field, error } = parseRawField(
			{ name: "author", id: "abc", type: "select", options: ["a", "b"], path: "" },
			"Book"
		);
		expect(error).toBeUndefined();
		expect(field).toEqual({
			id: "abc",
			name: "author",
			type: "Select",
			options: ["a", "b"],
			path: "",
			fileClassName: "Book",
		});
	});

	it("defaults type to Input and path to empty", () => {
		const { field } = parseRawField({ name: "n", id: "i" }, "FC");
		expect(field?.type).toBe("Input");
		expect(field?.path).toBe("");
		expect(field?.options).toEqual([]);
	});

	it("coerces an unknown type to Input with an error", () => {
		const { field, error } = parseRawField({ name: "n", id: "i", type: "Wobble" }, "FC");
		expect(field?.type).toBe("Input");
		expect(error).toMatch(/unknown type/);
	});

	it("reports missing name or id without producing a field", () => {
		expect(parseRawField({ id: "i" }, "FC").field).toBeUndefined();
		expect(parseRawField({ name: "n" }, "FC").field).toBeUndefined();
		expect(parseRawField({ id: "i" }, "FC").error).toMatch(/name/);
	});

	it("preserves structured (record) options", () => {
		const opts = { sourceType: "ValuesListNotePath", valuesListNotePath: "x.md" };
		const { field } = parseRawField({ name: "n", id: "i", type: "Select", options: opts }, "FC");
		expect(field?.options).toEqual(opts);
	});
});

describe("path helpers", () => {
	it("computes nesting level", () => {
		expect(fieldLevel("")).toBe(0);
		expect(fieldLevel("a")).toBe(1);
		expect(fieldLevel("a____b")).toBe(2);
	});

	it("identifies root fields and parent ids", () => {
		expect(isRootField({ path: "" })).toBe(true);
		expect(isRootField({ path: "a" })).toBe(false);
		expect(parentFieldId("")).toBeUndefined();
		expect(parentFieldId("a____b")).toBe("b");
	});
});

describe("normalizeListOptions", () => {
	it("indexes an array", () => {
		expect(normalizeListOptions(["x", "y"])).toEqual({ "0": "x", "1": "y" });
	});
	it("passes a record through as strings", () => {
		expect(normalizeListOptions({ "1": "a", "2": 2 })).toEqual({ "1": "a", "2": "2" });
	});
});

describe("capitalize", () => {
	it("uppercases the first char", () => {
		expect(capitalize("select")).toBe("Select");
		expect(capitalize("")).toBe("");
	});
});
