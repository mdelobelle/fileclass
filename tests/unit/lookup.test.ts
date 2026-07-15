import { describe, expect, it } from "vitest";

import { computeLookupValue, isSummarizing, LookupSource } from "../../src/computed/lookup";
import { Field, FieldOptions } from "../../src/schema/field";
import { lookupOptions } from "../../src/fields/options";

const src = (basename: string, summarized?: number): LookupSource => ({ basename, summarized });

describe("computeLookupValue", () => {
	const sources = [src("A", 3), src("B", 5), src("C")];

	it("LinksList → array of wikilinks", () => {
		expect(computeLookupValue("LinksList", sources)).toEqual(["[[A]]", "[[B]]", "[[C]]"]);
	});

	it("CountAll counts everything; Count counts non-empty summarized", () => {
		expect(computeLookupValue("CountAll", sources)).toBe(3);
		expect(computeLookupValue("Count", sources)).toBe(2);
	});

	it("Sum / Average / Max / Min over the summarized values", () => {
		expect(computeLookupValue("Sum", sources)).toBe(8);
		expect(computeLookupValue("Average", sources)).toBe(4); // (3+5)/2
		expect(computeLookupValue("Max", sources)).toBe(5);
		expect(computeLookupValue("Min", sources)).toBe(3);
	});

	it("summarizing empty sources yields ''", () => {
		expect(computeLookupValue("Average", [])).toBe("");
		expect(computeLookupValue("Sum", [])).toBe(0);
		expect(computeLookupValue("LinksList", [])).toEqual([]);
	});
});

describe("isSummarizing", () => {
	it("flags numeric outputs", () => {
		expect(isSummarizing("Sum")).toBe(true);
		expect(isSummarizing("Count")).toBe(true);
		expect(isSummarizing("LinksList")).toBe(false);
		expect(isSummarizing("CountAll")).toBe(false);
	});
});

describe("lookupOptions", () => {
	const make = (options: FieldOptions): Field => ({
		id: "i",
		name: "backlinks",
		type: "Lookup",
		options,
		path: "",
		fileClassName: "FC",
	});

	it("reads options with a default outputType", () => {
		expect(lookupOptions(make({ baseFile: "Tasks.base", targetFieldName: "project" }))).toEqual({
			baseFile: "Tasks.base",
			viewName: undefined,
			targetFieldName: "project",
			outputType: "LinksList",
			summarizedFieldName: undefined,
		});
	});

	it("keeps a valid outputType", () => {
		expect(lookupOptions(make({ outputType: "Sum", summarizedFieldName: "hours" })).outputType).toBe(
			"Sum"
		);
	});
});
