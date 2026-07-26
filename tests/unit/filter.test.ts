import { describe, expect, it } from "vitest";

import { isEmptyValue, matchesFilter } from "../../src/api/filter";

describe("isEmptyValue", () => {
	it("treats undefined/null/''/[] as empty", () => {
		for (const v of [undefined, null, "", []]) expect(isEmptyValue(v)).toBe(true);
	});
	it("treats 0, false and non-empty values as non-empty", () => {
		for (const v of [0, false, "x", ["a"]]) expect(isEmptyValue(v)).toBe(false);
	});
});

describe("matchesFilter", () => {
	const f = (op: string, value?: unknown) => ({ field: "x", op: op as never, value });

	it("is / isNot compare as strings", () => {
		expect(matchesFilter("CIO", f("is", "CIO"))).toBe(true);
		expect(matchesFilter("CIO", f("is", "OVH"))).toBe(false);
		expect(matchesFilter(3, f("is", "3"))).toBe(true);
		expect(matchesFilter("CIO", f("isNot", "OVH"))).toBe(true);
	});
	it("isEmpty / isNotEmpty", () => {
		expect(matchesFilter("", f("isEmpty"))).toBe(true);
		expect(matchesFilter([], f("isEmpty"))).toBe(true);
		expect(matchesFilter("x", f("isNotEmpty"))).toBe(true);
		expect(matchesFilter(undefined, f("isNotEmpty"))).toBe(false);
	});
	it("contains matches array membership and string substrings", () => {
		expect(matchesFilter(["a", "b"], f("contains", "b"))).toBe(true);
		expect(matchesFilter(["a", "b"], f("contains", "c"))).toBe(false);
		expect(matchesFilter("hello world", f("contains", "world"))).toBe(true);
		expect(matchesFilter(42, f("contains", "4"))).toBe(false); // non-string scalar → no
	});
	it("contains matches a substring inside array elements (link fields, #56)", () => {
		// MultiFile/MultiMedia store wikilinks; `comic` must match `[[comic]]`.
		expect(matchesFilter(["[[comic]]", "[[music]]"], f("contains", "comic"))).toBe(true);
		expect(matchesFilter(["[[Activities/comic|Comic]]"], f("contains", "comic"))).toBe(true);
		expect(matchesFilter(["[[music]]"], f("contains", "comic"))).toBe(false);
	});
	it("contains is case-insensitive, like ILIKE '%value%' (#56)", () => {
		expect(matchesFilter(["[[Comic]]"], f("contains", "comic"))).toBe(true);
		expect(matchesFilter(["[[comic]]"], f("contains", "COMIC"))).toBe(true);
		expect(matchesFilter("Hello World", f("contains", "hello"))).toBe(true);
	});
});
