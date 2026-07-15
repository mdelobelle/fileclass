import { describe, expect, it } from "vitest";

import {
	fileClassNameFromPath,
	parseFileClass,
	stringToBoolean,
	toStringArray,
} from "../../src/schema/fileClass";

describe("toStringArray", () => {
	it("accepts arrays, comma strings, and nothing", () => {
		expect(toStringArray(["a", "b"])).toEqual(["a", "b"]);
		expect(toStringArray("a, b ,c")).toEqual(["a", "b", "c"]);
		expect(toStringArray(undefined)).toEqual([]);
		expect(toStringArray("")).toEqual([]);
	});
});

describe("stringToBoolean", () => {
	it("coerces loose encodings", () => {
		expect(stringToBoolean(true)).toBe(true);
		expect(stringToBoolean("true")).toBe(true);
		expect(stringToBoolean("false")).toBe(false);
		expect(stringToBoolean(undefined)).toBe(false);
	});
});

describe("fileClassNameFromPath", () => {
	it("extracts the name under the class folder", () => {
		expect(fileClassNameFromPath("Settings/fileClasses/", "Settings/fileClasses/Book.md")).toBe(
			"Book"
		);
	});
	it("returns undefined outside the folder or for non-md", () => {
		expect(fileClassNameFromPath("Settings/fileClasses/", "Notes/Book.md")).toBeUndefined();
		expect(
			fileClassNameFromPath("Settings/fileClasses/", "Settings/fileClasses/Book.base")
		).toBeUndefined();
		expect(fileClassNameFromPath("", "anything.md")).toBeUndefined();
	});
});

describe("parseFileClass", () => {
	it("parses fields and options faithfully", () => {
		const fc = parseFileClass("Activity", {
			limit: 20,
			mapWithTag: false,
			icon: "user-round-cog",
			tagNames: "todo, done",
			excludes: ["old"],
			extends: "Base",
			version: 2.4,
			fields: [{ name: "category", id: "U6", type: "Select", options: { a: 1 }, path: "" }],
		});
		expect(fc.name).toBe("Activity");
		expect(fc.fields).toHaveLength(1);
		expect(fc.fields[0].type).toBe("Select");
		expect(fc.options).toMatchObject({
			limit: 20,
			icon: "user-round-cog",
			extends: "Base",
			excludes: ["old"],
			tagNames: ["todo", "done"],
			mapWithTag: false,
			version: "2.4",
		});
	});

	it("collects errors from malformed fields but keeps valid ones", () => {
		const fc = parseFileClass("FC", {
			fields: [{ id: "no-name" }, { name: "ok", id: "i1" }],
		});
		expect(fc.fields).toHaveLength(1);
		expect(fc.fields[0].name).toBe("ok");
		expect(fc.errors).toHaveLength(1);
	});

	it("handles empty / missing frontmatter", () => {
		const fc = parseFileClass("Empty", null);
		expect(fc.fields).toEqual([]);
		expect(fc.options.extends).toBeUndefined();
		expect(fc.options.mapWithTag).toBe(false);
	});
});
