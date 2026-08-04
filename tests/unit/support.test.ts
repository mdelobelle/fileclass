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
		expect(isInputSupported("Color")).toBe(true);
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
		// How much is in there beats a mute `{…}`: the raw value is shown raw where
		// there is room for it, and named by its size where there isn't.
		expect(displayValue(make("Object"), { a: 1 })).toBe("1 key");
		expect(displayValue(make("Object"), { a: 1, b: 2 })).toBe("2 keys");
		expect(displayValue(make("Object"), {})).toBe("{}");
		expect(displayValue(make("ObjectList"), [{}, {}])).toBe("2 items");
		expect(displayValue(make("ObjectList"), [{}])).toBe("1 item");
		expect(displayValue(make("ObjectList"), [])).toBe("");
	});

	it("sizes a free-form JSON/YAML value the same way", () => {
		expect(displayValue(make("YAML"), { producer: "Teo", engineer: "Fred" })).toBe("2 keys");
		expect(displayValue(make("JSON"), [1, 2, 3])).toBe("3 items");
		expect(displayValue(make("JSON"), "just text")).toBe("just text");
	});
});
