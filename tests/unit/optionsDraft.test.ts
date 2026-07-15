import { describe, expect, it } from "vitest";

import { buildFieldOptions, optionsToDraft } from "../../src/fields/optionsDraft";

describe("Number options", () => {
	it("round-trips min/max/step", () => {
		const draft = optionsToDraft("Number", { min: 1, max: 10, step: 0.5 });
		expect(draft).toEqual({ min: "1", max: "10", step: "0.5" });
		expect(buildFieldOptions("Number", draft)).toEqual({ min: 1, max: 10, step: 0.5 });
	});
	it("omits blank/invalid numbers", () => {
		expect(buildFieldOptions("Number", { min: "", max: "x", step: "2" })).toEqual({ step: 2 });
	});
});

describe("Date options", () => {
	it("reads and writes format + insert-as-link", () => {
		const draft = optionsToDraft("Date", { dateFormat: "YYYY", defaultInsertAsLink: "true" });
		expect(draft).toEqual({ dateFormat: "YYYY", defaultInsertAsLink: true });
		expect(buildFieldOptions("DateTime", draft)).toEqual({
			dateFormat: "YYYY",
			defaultInsertAsLink: true,
		});
	});
});

describe("Select/Cycle/Multi list source", () => {
	it("reads an inline list into ordered values", () => {
		const draft = optionsToDraft("Select", { sourceType: "ValuesList", valuesList: { "1": "a", "2": "b" } });
		expect(draft).toEqual({ sourceType: "ValuesList", values: ["a", "b"] });
	});

	it("reads the legacy inline shape (options is the value map)", () => {
		const draft = optionsToDraft("Select", { "1": "🟢", "2": "🟡" });
		expect(draft).toEqual({ sourceType: "ValuesList", values: ["🟢", "🟡"] });
	});

	it("builds an inline valuesList (1-based, skips blanks)", () => {
		expect(buildFieldOptions("Multi", { sourceType: "ValuesList", values: ["x", "", "y"] })).toEqual({
			sourceType: "ValuesList",
			valuesList: { "1": "x", "2": "y" },
		});
	});

	it("round-trips a note-path source", () => {
		const draft = optionsToDraft("Cycle", {
			sourceType: "ValuesListNotePath",
			valuesListNotePath: "L.md",
		});
		expect(draft).toEqual({ sourceType: "ValuesListNotePath", valuesListNotePath: "L.md" });
		expect(buildFieldOptions("Cycle", draft)).toEqual({
			sourceType: "ValuesListNotePath",
			valuesListNotePath: "L.md",
		});
	});

	it("leaves an unsupported (base/dv) source untouched", () => {
		const draft = optionsToDraft("Select", { sourceType: "ValuesFromDVQuery" });
		expect(draft.sourceType).toBeUndefined();
		expect(buildFieldOptions("Select", draft)).toBeUndefined();
	});
});

describe("File / Media base binding", () => {
	it("round-trips base file, view, display column", () => {
		const draft = optionsToDraft("File", {
			baseFile: "People.base",
			viewName: "All",
			displayColumn: "note.title",
		});
		expect(draft).toEqual({
			baseFile: "People.base",
			viewName: "All",
			displayColumn: "note.title",
			embed: false,
		});
		expect(buildFieldOptions("MultiFile", draft)).toEqual({
			baseFile: "People.base",
			viewName: "All",
			displayColumn: "note.title",
		});
	});

	it("writes embed only for Media types", () => {
		const draft = { baseFile: "M.base", embed: true };
		expect(buildFieldOptions("Media", draft)).toEqual({ baseFile: "M.base", embed: true });
		expect(buildFieldOptions("File", draft)).toEqual({ baseFile: "M.base" });
	});
});

describe("unmanaged types preserve options", () => {
	it("returns undefined for Object/ObjectList/Boolean/Input", () => {
		for (const t of ["Object", "ObjectList", "Boolean", "Input"] as const) {
			expect(buildFieldOptions(t, {})).toBeUndefined();
		}
	});
});
