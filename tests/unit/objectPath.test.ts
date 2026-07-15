import { describe, expect, it } from "vitest";

import {
	formatPath,
	getAtPath,
	insertAtPath,
	parsePath,
	removeAtPath,
	setAtPath,
} from "../../src/engine/objectPath";

describe("parsePath", () => {
	it("parses dotted keys and numeric indices (Bases syntax)", () => {
		expect(parsePath("fields[0].name")).toEqual(["fields", 0, "name"]);
		expect(parsePath("a.b.c")).toEqual(["a", "b", "c"]);
		expect(parsePath("root")).toEqual(["root"]);
	});

	it("parses quoted bracket keys", () => {
		expect(parsePath('note["a"][0]["b"]')).toEqual(["note", "a", 0, "b"]);
		expect(parsePath("note['weird key']")).toEqual(["note", "weird key"]);
		expect(parsePath('note["with.dot"]')).toEqual(["note", "with.dot"]);
	});

	it("handles escapes inside quoted keys", () => {
		expect(parsePath('a["x\\"y"]')).toEqual(["a", 'x"y']);
	});

	it("round-trips through formatPath", () => {
		for (const p of ["fields[0].name", "a.b.c", 'note["with.dot"][2]']) {
			expect(formatPath(parsePath(p))).toBe(p);
		}
	});

	it("rejects malformed paths", () => {
		expect(() => parsePath("")).toThrow();
		expect(() => parsePath(".a")).toThrow();
		expect(() => parsePath("a.")).toThrow();
		expect(() => parsePath("a[")).toThrow();
		expect(() => parsePath("a[b]")).toThrow(); // unquoted non-numeric bracket
		expect(() => parsePath('a["x]')).toThrow(); // unterminated string
	});
});

describe("getAtPath", () => {
	const data = { fields: [{ name: "title" }, { name: "date" }], meta: { n: 3 } };

	it("reads nested values", () => {
		expect(getAtPath(data, "fields[0].name")).toBe("title");
		expect(getAtPath(data, "fields[1].name")).toBe("date");
		expect(getAtPath(data, "meta.n")).toBe(3);
		expect(getAtPath(data, parsePath("fields[1].name"))).toBe("date");
	});

	it("returns undefined for missing or mistyped steps", () => {
		expect(getAtPath(data, "fields[9].name")).toBeUndefined();
		expect(getAtPath(data, "meta.missing")).toBeUndefined();
		expect(getAtPath(data, "meta.n.deeper")).toBeUndefined();
		expect(getAtPath(data, "meta[0]")).toBeUndefined(); // index into object
	});
});

describe("setAtPath", () => {
	it("sets an existing nested value in place", () => {
		const data = { fields: [{ name: "title" }] };
		setAtPath(data, "fields[0].name", "heading");
		expect(data.fields[0].name).toBe("heading");
	});

	it("creates intermediate objects and arrays as needed", () => {
		const data: Record<string, unknown> = {};
		setAtPath(data, "a.b[0].c", 42);
		expect(data).toEqual({ a: { b: [{ c: 42 }] } });
	});

	it("preserves sibling and unknown keys (D5)", () => {
		const data = { keep: 1, obj: { known: "x", unknown: "y" } };
		setAtPath(data, "obj.known", "z");
		expect(data).toEqual({ keep: 1, obj: { known: "z", unknown: "y" } });
	});

	it("throws on container/segment kind conflicts", () => {
		expect(() => setAtPath({ a: 5 }, "a.b", 1)).toThrow();
		expect(() => setAtPath({ a: [] }, "a.b", 1)).toThrow(); // key on array
		expect(() => setAtPath({ a: {} }, "a[0]", 1)).toThrow(); // index on object
	});
});

describe("insertAtPath", () => {
	it("appends by default", () => {
		const data = { list: ["a", "b"] };
		insertAtPath(data, "list", "c");
		expect(data.list).toEqual(["a", "b", "c"]);
	});

	it("inserts at a given index", () => {
		const data = { list: ["a", "c"] };
		insertAtPath(data, "list", "b", 1);
		expect(data.list).toEqual(["a", "b", "c"]);
	});

	it("creates the array when missing", () => {
		const data: Record<string, unknown> = {};
		insertAtPath(data, "items[0].tags", "first");
		expect(data).toEqual({ items: [{ tags: ["first"] }] });
	});

	it("throws when the target exists and is not an array", () => {
		expect(() => insertAtPath({ x: 1 }, "x", "v")).toThrow();
	});
});

describe("removeAtPath", () => {
	it("splices an array element", () => {
		const data = { list: ["a", "b", "c"] };
		removeAtPath(data, "list[1]");
		expect(data.list).toEqual(["a", "c"]);
	});

	it("deletes an object key", () => {
		const data = { obj: { a: 1, b: 2 } };
		removeAtPath(data, "obj.a");
		expect(data.obj).toEqual({ b: 2 });
	});

	it("is a no-op when the parent is missing", () => {
		const data = { obj: { a: 1 } };
		removeAtPath(data, "missing.deep");
		expect(data).toEqual({ obj: { a: 1 } });
	});
});
