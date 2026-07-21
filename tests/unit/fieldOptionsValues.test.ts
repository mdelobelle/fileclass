import { describe, expect, it, vi } from "vitest";

import { Field, FieldOptions } from "../../src/schema/field";
import { dateOptions, listOptions, numberOptions } from "../../src/fields/options";
import { resolveNoteFile, resolveValues } from "../../src/fields/values";
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

	it("reads the legacy shape where options is the values list itself", () => {
		// e.g. mood: { "1": "🟢", "2": "🟡" } — no valuesList/sourceType wrapper.
		const o = listOptions(make({ "1": "🟢", "2": "🟡", "3": "🟠" }));
		expect(o.sourceType).toBe("ValuesList");
		expect(o.valuesList).toEqual({ "1": "🟢", "2": "🟡", "3": "🟠" });
	});
});

describe("resolveValues (legacy inline shape)", () => {
	it("returns the values of a bare index→value options object", () => {
		expect(resolveValues(make({ "1": "🟢", "2": "🟡" }))).toEqual(["🟢", "🟡"]);
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

describe("resolveNoteFile", () => {
	it("uses the exact path when it resolves, without falling back", () => {
		const byPath = vi.fn((p: string) => (p === "L.md" ? { tag: "exact" } : null));
		const byLink = vi.fn(() => ({ tag: "link" }));
		expect(resolveNoteFile("L.md", byPath, byLink)).toEqual({ tag: "exact" });
		expect(byLink).not.toHaveBeenCalled();
	});

	it("falls back to linkpath resolution when the exact path misses (e.g. no .md)", () => {
		const byPath = vi.fn(() => null);
		const byLink = vi.fn((lp: string) => (lp === "dir/Regno" ? { tag: "link" } : null));
		expect(resolveNoteFile("dir/Regno", byPath, byLink)).toEqual({ tag: "link" });
		expect(byLink).toHaveBeenCalledWith("dir/Regno", "");
	});

	it("returns null when neither lookup resolves", () => {
		expect(
			resolveNoteFile(
				"missing",
				() => null,
				() => null
			)
		).toBeNull();
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
