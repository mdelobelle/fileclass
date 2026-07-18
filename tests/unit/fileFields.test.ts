import { describe, expect, it } from "vitest";

import { Field, FieldOptions, FieldType } from "../../src/schema/field";
import { baseBindingOptions } from "../../src/fields/options";
import { displayValue } from "../../src/fields/display";
import { isListType, validateField } from "../../src/fields/validate";

const make = (type: FieldType, options: FieldOptions = []): Field => ({
	id: "i",
	name: "f",
	type,
	options,
	path: "",
	fileClassName: "FC",
});

describe("baseBindingOptions", () => {
	it("reads base/view/display/embed", () => {
		const o = baseBindingOptions(
			make("File", {
				baseFile: "People.base",
				viewName: "All",
				displayColumn: "note.title",
				embed: "true",
			})
		);
		expect(o).toEqual({
			baseFile: "People.base",
			viewName: "All",
			displayColumn: "note.title",
			embed: true,
		});
	});

	it("defaults to no binding and no embed", () => {
		expect(baseBindingOptions(make("File"))).toEqual({
			baseFile: undefined,
			viewName: undefined,
			displayColumn: undefined,
			embed: false,
		});
	});
});

describe("link-type validation", () => {
	it("File/Media require a string; empty is valid", () => {
		expect(validateField(make("File"), "[[Note]]").ok).toBe(true);
		expect(validateField(make("Media"), "").ok).toBe(true);
		expect(validateField(make("File"), ["x"]).ok).toBe(false);
	});

	it("MultiFile/MultiMedia require a list", () => {
		expect(validateField(make("MultiFile"), ["[[a]]", "[[b]]"]).ok).toBe(true);
		expect(validateField(make("MultiMedia"), "[[a]]").ok).toBe(false);
	});
});

describe("list-type detection & display", () => {
	it("treats Multi* as list types", () => {
		expect(isListType("MultiFile")).toBe(true);
		expect(isListType("MultiMedia")).toBe(true);
		expect(isListType("File")).toBe(false);
	});

	it("joins multi links for display", () => {
		expect(displayValue(make("MultiFile"), ["[[a]]", "[[b]]"])).toBe("[[a]], [[b]]");
	});
});
