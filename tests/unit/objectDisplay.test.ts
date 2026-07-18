import { describe, expect, it } from "vitest";

import { describeField, DisplayDeps, renderObjectItem } from "../../src/fields/objectDisplay";
import { Field, FieldType } from "../../src/schema/field";

let counter = 0;
function field(name: string, type: FieldType, opts: Record<string, unknown> = {}, path = ""): Field {
	return { id: `${name}-${counter++}`, name, type, options: opts, path, fileClassName: "T" };
}

/** An "address" object field + its children (children path = the object's id). */
function addressSchema(objOptions: Record<string, unknown> = {}): { obj: Field; all: Field[] } {
	const obj = field("address", "Object", objOptions);
	obj.id = "address";
	const all: Field[] = [
		obj,
		field("rue", "Input", {}, "address"),
		field("ville", "Input", {}, "address"),
		field("pays", "Input", {}, "address"),
		field("designation", "Input", {}, "address"),
	];
	return { obj, all };
}

// formatMoment stub: encodes value + chosen output format so we can assert it.
function deps(all: Field[], defaultDateFormat = ""): DisplayDeps {
	return {
		allFields: all,
		defaultDateFormat,
		formatMoment: (value, _parse, out) => `${value}@${out}`,
	};
}

describe("renderObjectItem — templates", () => {
	it("interpolates {{field}} placeholders", () => {
		const { obj, all } = addressSchema({ displayTemplate: "{{designation}} - {{ville}} - {{pays}}" });
		const value = { designation: "Home", ville: "Paris", pays: "FR", rue: "1 rue X" };
		expect(renderObjectItem(obj, value, deps(all))).toBe("Home - Paris - FR");
	});

	it("falls back to the first non-empty child when no template", () => {
		const { obj, all } = addressSchema();
		expect(renderObjectItem(obj, { rue: "", ville: "Lyon" }, deps(all))).toBe("Lyon");
	});

	it("renders an empty string for a missing token field", () => {
		const { obj, all } = addressSchema({ displayTemplate: "{{unknown}}" });
		expect(renderObjectItem(obj, { ville: "Paris" }, deps(all))).toBe("");
	});
});

describe("describeField — dates", () => {
	it("uses a per-token moment format override", () => {
		const obj: Field = { id: "o", name: "o", type: "Object", options: { displayTemplate: "{{start|YYYY}}" }, path: "", fileClassName: "T" };
		const all = [obj, field("start", "Date", {}, "o")];
		expect(renderObjectItem(obj, { start: "2026-07-16" }, deps(all))).toBe("2026-07-16@YYYY");
	});

	it("uses the plugin default date format when no override", () => {
		const f = field("d", "Date");
		expect(describeField(f, "2026-07-16", deps([f], "DD/MM/YYYY"))).toBe("2026-07-16@DD/MM/YYYY");
	});

	it("shows the stored value when no format is configured", () => {
		const f = field("d", "Date");
		expect(describeField(f, "2026-07-16", deps([f], ""))).toBe("2026-07-16");
	});

	it("shows an insert-as-link date verbatim", () => {
		const f = field("d", "Date");
		expect(describeField(f, "[[2026-07-16]]", deps([f], "YYYY"))).toBe("[[2026-07-16]]");
	});
});

describe("describeField — ObjectList", () => {
	it("prefixes each item with its 1-based rank", () => {
		const list: Field = { id: "addrs", name: "addrs", type: "ObjectList", options: { displayTemplate: "{{ville}}" }, path: "", fileClassName: "T" };
		const all = [list, field("ville", "Input", {}, "addrs")];
		const value = [{ ville: "Paris" }, { ville: "Lyon" }];
		expect(describeField(list, value, deps(all))).toBe("1. Paris  ·  2. Lyon");
	});

	it("is empty for an empty list", () => {
		const list: Field = { id: "addrs", name: "addrs", type: "ObjectList", options: {}, path: "", fileClassName: "T" };
		expect(describeField(list, [], deps([list]))).toBe("");
	});
});

describe("renderObjectItem — nested object", () => {
	it("uses the nested object's own template", () => {
		const parent: Field = { id: "person", name: "person", type: "Object", options: { displayTemplate: "{{home}}" }, path: "", fileClassName: "T" };
		const home: Field = { id: "home", name: "home", type: "Object", options: { displayTemplate: "{{ville}}" }, path: "person", fileClassName: "T" };
		const ville = field("ville", "Input", {}, "person____home");
		const all = [parent, home, ville];
		const value = { home: { ville: "Nice" } };
		expect(renderObjectItem(parent, value, deps(all))).toBe("Nice");
	});
});
