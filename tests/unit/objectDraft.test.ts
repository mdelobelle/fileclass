import { describe, expect, it } from "vitest";

import { childFieldsOf, childPathOf, Field, FieldType } from "../../src/schema/field";
import {
	asListValue,
	asObjectValue,
	childSummary,
	cloneDraft,
	validateObjectDraft,
} from "../../src/fields/objectDraft";

const field = (id: string, name: string, type: FieldType, path: string): Field => ({
	id,
	name,
	type,
	options: [],
	path,
	fileClassName: "FC",
});

describe("childFieldsOf / childPathOf", () => {
	// address (Object, id=addr, root) → street, city (path "addr")
	// address.geo (Object, id=geo, path "addr") → lat (path "addr____geo")
	const address = field("addr", "address", "Object", "");
	const street = field("s", "street", "Input", "addr");
	const city = field("c", "city", "Input", "addr");
	const geo = field("geo", "geo", "Object", "addr");
	const lat = field("lat", "lat", "Number", "addr____geo");
	const root = field("r", "title", "Input", "");
	const all = [root, address, street, city, geo, lat];

	it("computes the child path", () => {
		expect(childPathOf(address)).toBe("addr");
		expect(childPathOf(geo)).toBe("addr____geo");
	});

	it("returns direct children only", () => {
		expect(childFieldsOf(all, address).map((f) => f.name)).toEqual(["street", "city", "geo"]);
		expect(childFieldsOf(all, geo).map((f) => f.name)).toEqual(["lat"]);
		expect(childFieldsOf(all, street)).toEqual([]);
	});
});

describe("cloneDraft", () => {
	it("deep-clones and preserves unknown keys (D5)", () => {
		const original = { known: 1, unknown: { nested: [1, 2] } };
		const clone = cloneDraft(original);
		clone.known = 9;
		(clone.unknown.nested as number[]).push(3);
		expect(original).toEqual({ known: 1, unknown: { nested: [1, 2] } });
		expect(clone).toEqual({ known: 9, unknown: { nested: [1, 2, 3] } });
	});
});

describe("validateObjectDraft", () => {
	const children = [field("n", "n", "Number", "obj"), field("t", "t", "Input", "obj")];

	it("passes when all known children are valid or empty", () => {
		expect(validateObjectDraft(children, { n: 5, t: "x" })).toBeUndefined();
		expect(validateObjectDraft(children, {})).toBeUndefined();
	});

	it("reports the first invalid child", () => {
		expect(validateObjectDraft(children, { n: "abc" })).toMatch(/must be a number/);
	});
});

describe("childSummary", () => {
	const children = [field("a", "a", "Input", "obj"), field("b", "b", "Input", "obj")];
	it("uses the first non-empty child value", () => {
		expect(childSummary(children, { a: "", b: "hello" })).toBe("hello");
		expect(childSummary(children, {})).toBe("(empty)");
	});
});

describe("asObjectValue / asListValue", () => {
	it("narrows to object or empty object", () => {
		expect(asObjectValue({ a: 1 })).toEqual({ a: 1 });
		expect(asObjectValue([1, 2])).toEqual({});
		expect(asObjectValue("x")).toEqual({});
	});
	it("narrows to array or empty array", () => {
		expect(asListValue([{ a: 1 }])).toEqual([{ a: 1 }]);
		expect(asListValue({ a: 1 })).toEqual([]);
	});
});
