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
	it("reads and writes format + insert-as-link + link path", () => {
		const draft = optionsToDraft("Date", {
			dateFormat: "YYYY",
			defaultInsertAsLink: "true",
			dateLinkPath: "Journal/",
		});
		expect(draft).toEqual({
			dateFormat: "YYYY",
			defaultInsertAsLink: true,
			dateLinkPath: "Journal/",
		});
		expect(buildFieldOptions("DateTime", draft)).toEqual({
			dateFormat: "YYYY",
			defaultInsertAsLink: true,
			dateLinkPath: "Journal/",
		});
	});

	it("defaults link path to empty and omits it when blank", () => {
		const draft = optionsToDraft("Date", { dateFormat: "YYYY" });
		expect(draft).toEqual({ dateFormat: "YYYY", defaultInsertAsLink: false, dateLinkPath: "" });
		expect(buildFieldOptions("Date", draft)).toEqual({ dateFormat: "YYYY" });
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

	it("round-trips a Base-view source", () => {
		const draft = optionsToDraft("Select", {
			sourceType: "ValuesFromBase",
			baseFile: "Activities.base",
			viewName: "All",
		});
		expect(draft).toEqual({
			sourceType: "ValuesFromBase",
			baseFile: "Activities.base",
			viewName: "All",
		});
		expect(buildFieldOptions("Select", draft)).toEqual({
			sourceType: "ValuesFromBase",
			baseFile: "Activities.base",
			viewName: "All",
		});
	});

	it("leaves a legacy Dataview source untouched", () => {
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
	it("returns undefined for Boolean/Input", () => {
		for (const t of ["Boolean", "Input"] as const) {
			expect(buildFieldOptions(t, {})).toBeUndefined();
		}
	});
});

describe("Object/ObjectList display template", () => {
	it("reads the template and keeps the original options", () => {
		const draft = optionsToDraft("Object", { displayTemplate: "{{ville}}", foo: "bar" });
		expect(draft.displayTemplate).toBe("{{ville}}");
		expect(draft.objectRawOptions).toEqual({ displayTemplate: "{{ville}}", foo: "bar" });
	});
	it("writes the template while preserving unknown keys", () => {
		const draft = optionsToDraft("ObjectList", { foo: "bar" });
		draft.displayTemplate = "{{name}}";
		expect(buildFieldOptions("ObjectList", draft)).toEqual({ foo: "bar", displayTemplate: "{{name}}" });
	});
	it("removes the template when cleared, keeping other keys", () => {
		const draft = optionsToDraft("Object", { displayTemplate: "{{x}}", foo: "bar" });
		draft.displayTemplate = "";
		expect(buildFieldOptions("Object", draft)).toEqual({ foo: "bar" });
	});
});
