import { describe, expect, it } from "vitest";

import { buildFieldOptions, optionsToDraft } from "../../src/fields/optionsDraft";

describe("Input options", () => {
	it("round-trips the template option", () => {
		const draft = optionsToDraft("Input", { template: "pg. {{page}}" });
		expect(draft.template).toBe("pg. {{page}}");
		expect(buildFieldOptions("Input", draft)).toEqual({ template: "pg. {{page}}" });
	});
	it("omits a blank template", () => {
		expect(buildFieldOptions("Input", { template: "   " })).toEqual({});
		expect(buildFieldOptions("Input", {})).toEqual({});
	});
	it("preserves unknown option keys through a template edit", () => {
		const draft = optionsToDraft("Input", { required: true, custom: "x" });
		draft.template = "{{a}}";
		expect(buildFieldOptions("Input", draft)).toEqual({
			required: true,
			custom: "x",
			template: "{{a}}",
		});
	});
	it("MultiInput reuses the same template option handling", () => {
		const draft = optionsToDraft("MultiInput", { template: "{{a}}-{{b}}" });
		expect(draft.template).toBe("{{a}}-{{b}}");
		expect(buildFieldOptions("MultiInput", draft)).toEqual({ template: "{{a}}-{{b}}" });
	});
});

describe("Duration presets option", () => {
	it("round-trips the presets list for Duration and CycleDuration", () => {
		const draft = optionsToDraft("CycleDuration", { presets: ["P1D", "P1W", "P2W"] });
		expect(draft.durationPresets).toEqual(["P1D", "P1W", "P2W"]);
		expect(buildFieldOptions("CycleDuration", draft)).toEqual({ presets: ["P1D", "P1W", "P2W"] });
		expect(buildFieldOptions("Duration", optionsToDraft("Duration", { presets: ["PT30M"] }))).toEqual({
			presets: ["PT30M"],
		});
	});
	it("omits an empty presets list but preserves unknown keys", () => {
		const draft = optionsToDraft("Duration", { custom: "x" });
		expect(buildFieldOptions("Duration", draft)).toEqual({ custom: "x" });
	});
});

describe("Icon options", () => {
	it("round-trips a non-default iconSource, omits the default", () => {
		const draft = optionsToDraft("Icon", { iconSource: "all" });
		expect(draft.iconSource).toBe("all");
		expect(buildFieldOptions("Icon", draft)).toEqual({ iconSource: "all" });
		expect(buildFieldOptions("Icon", optionsToDraft("Icon", {}))).toEqual({}); // default lucide omitted
	});
	it("preserves unknown keys", () => {
		const draft = optionsToDraft("Icon", { custom: "x" });
		expect(buildFieldOptions("Icon", draft)).toEqual({ custom: "x" });
	});
});

describe("Color options", () => {
	it("round-trips a non-default colorSource, omits the default", () => {
		expect(buildFieldOptions("Color", optionsToDraft("Color", { colorSource: "theme" }))).toEqual({
			colorSource: "theme",
		});
		expect(buildFieldOptions("Color", optionsToDraft("Color", {}))).toEqual({}); // default canvas omitted
	});
});

describe("Date next-interval option", () => {
	it("round-trips nextIntervalField for Date/DateTime", () => {
		const draft = optionsToDraft("Date", { nextIntervalField: "interval" });
		expect(draft.nextIntervalField).toBe("interval");
		expect(buildFieldOptions("Date", draft)).toEqual({ nextIntervalField: "interval" });
	});
	it("never writes nextIntervalField for a Time field", () => {
		expect(buildFieldOptions("Time", { nextIntervalField: "interval" })).toEqual({});
	});
});

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
			nextIntervalField: "",
		});
		expect(buildFieldOptions("DateTime", draft)).toEqual({
			dateFormat: "YYYY",
			defaultInsertAsLink: true,
			dateLinkPath: "Journal/",
		});
	});

	it("defaults link path to empty and omits it when blank", () => {
		const draft = optionsToDraft("Date", { dateFormat: "YYYY" });
		expect(draft).toEqual({
			dateFormat: "YYYY",
			defaultInsertAsLink: false,
			dateLinkPath: "",
			nextIntervalField: "",
		});
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
			valuesColumn: "",
		});
		expect(buildFieldOptions("Select", draft)).toEqual({
			sourceType: "ValuesFromBase",
			baseFile: "Activities.base",
			viewName: "All",
		});
	});

	it("round-trips a Base-view source with a values column", () => {
		const draft = optionsToDraft("Multi", {
			sourceType: "ValuesFromBase",
			baseFile: "Activities.base",
			viewName: "All",
			valuesColumn: "note.title",
		});
		expect(draft.valuesColumn).toBe("note.title");
		expect(buildFieldOptions("Multi", draft)).toEqual({
			sourceType: "ValuesFromBase",
			baseFile: "Activities.base",
			viewName: "All",
			valuesColumn: "note.title",
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
	it("returns undefined for Boolean (no options)", () => {
		expect(buildFieldOptions("Boolean", {})).toBeUndefined();
	});
});

describe("Canvas options", () => {
	it("reads path + direction and preserves advanced filter keys", () => {
		const draft = optionsToDraft("Canvas", {
			canvasPath: "Board.canvas",
			direction: "incoming",
			edgeColors: ["1"],
		});
		expect(draft.canvasPath).toBe("Board.canvas");
		expect(draft.canvasDirection).toBe("incoming");
		expect(draft.canvasRawOptions).toEqual({ canvasPath: "Board.canvas", direction: "incoming", edgeColors: ["1"] });
	});
	it("writes path + direction, keeping unknown filter keys", () => {
		const draft = optionsToDraft("CanvasGroupLink", { edgeLabels: ["rel"] });
		draft.canvasPath = "B.canvas";
		draft.canvasDirection = "outgoing";
		expect(buildFieldOptions("CanvasGroupLink", draft)).toEqual({
			canvasPath: "B.canvas",
			direction: "outgoing",
			edgeLabels: ["rel"],
		});
	});
	it("drops direction for CanvasGroup", () => {
		const draft = optionsToDraft("CanvasGroup", { canvasPath: "B.canvas", direction: "incoming" });
		expect(buildFieldOptions("CanvasGroup", draft)).toEqual({ canvasPath: "B.canvas" });
	});
	it("round-trips edge/node filters and matching-files base for Canvas", () => {
		const stored = {
			canvasPath: "B.canvas",
			direction: "outgoing",
			edgeColors: ["1", "0"],
			edgeFromSides: ["top"],
			edgeLabels: ["rel"],
			nodeColors: ["4"],
			baseFile: "People.base",
			viewName: "Students",
		};
		const draft = optionsToDraft("Canvas", stored);
		expect(draft.edgeColors).toEqual(["1", "0"]);
		expect(draft.baseFile).toBe("People.base");
		expect(buildFieldOptions("Canvas", draft)).toEqual(stored);
	});
	it("keeps group filters but drops edge/link keys for CanvasGroup", () => {
		const draft = optionsToDraft("CanvasGroup", { canvasPath: "B.canvas", groupLabels: ["Team"] });
		draft.edgeColors = ["1"]; // not applicable to CanvasGroup
		draft.baseFile = "X.base";
		expect(buildFieldOptions("CanvasGroup", draft)).toEqual({ canvasPath: "B.canvas", groupLabels: ["Team"] });
	});
	it("defaults an absent direction to bothsides", () => {
		const draft = optionsToDraft("Canvas", { canvasPath: "B.canvas" });
		expect(draft.canvasDirection).toBe("bothsides");
		expect(buildFieldOptions("Canvas", draft)).toEqual({ canvasPath: "B.canvas", direction: "bothsides" });
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
