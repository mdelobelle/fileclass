import { describe, expect, it } from "vitest";

import { Field, FieldType } from "../../src/schema/field";
import { defaultValueFor, editableRootFields, isInputSupported } from "../../src/fields/support";
import { displayValue } from "../../src/fields/display";

const make = (type: FieldType, path = ""): Field => ({
	id: type + path,
	name: type,
	type,
	options: [],
	path,
	fileClassName: "FC",
});

describe("isInputSupported", () => {
	it("covers waves A/B/C, excludes computed types", () => {
		expect(isInputSupported("Input")).toBe(true);
		expect(isInputSupported("MultiInput")).toBe(true);
		expect(isInputSupported("Duration")).toBe(true);
		expect(isInputSupported("CycleDuration")).toBe(true);
		expect(isInputSupported("Location")).toBe(true);
		expect(isInputSupported("Icon")).toBe(true);
		expect(isInputSupported("MultiFile")).toBe(true);
		expect(isInputSupported("ObjectList")).toBe(true);
		expect(isInputSupported("Lookup")).toBe(false);
		expect(isInputSupported("Formula")).toBe(false);
	});
});

describe("editableRootFields", () => {
	it("keeps only supported root fields", () => {
		const fields = [
			make("Input"), // root, supported
			make("Number", "obj"), // nested → excluded
			make("Lookup"), // unsupported → excluded
			make("Object"), // root, supported
		];
		expect(editableRootFields(fields).map((f) => f.type)).toEqual(["Input", "Object"]);
	});
});

describe("defaultValueFor", () => {
	it("returns type-appropriate empties", () => {
		expect(defaultValueFor(make("Object"))).toEqual({});
		expect(defaultValueFor(make("ObjectList"))).toEqual([]);
		expect(defaultValueFor(make("MultiFile"))).toEqual([]);
		expect(defaultValueFor(make("MultiInput"))).toEqual([]);
		expect(defaultValueFor(make("Input"))).toBe("");
	});
});

describe("displayValue for nested types", () => {
	it("summarizes Object and ObjectList", () => {
		expect(displayValue(make("Object"), { a: 1 })).toBe("{…}");
		expect(displayValue(make("ObjectList"), [{}, {}])).toBe("2 items");
		expect(displayValue(make("ObjectList"), [{}])).toBe("1 item");
		expect(displayValue(make("ObjectList"), [])).toBe("");
	});
});
