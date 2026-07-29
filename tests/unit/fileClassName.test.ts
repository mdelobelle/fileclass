import { describe, it, expect } from "vitest";

import { isFileClassPath } from "../../src/schema/constants";
import { fileClassNameFromFile } from "../../src/schema/fileClass";

describe("isFileClassPath", () => {
	it("accepts a .fileclass.md path anywhere", () => {
		expect(isFileClassPath("a/b/Task.fileclass.md")).toBe(true);
		expect(isFileClassPath("Task.fileclass.md")).toBe(true);
	});
	it("rejects plain markdown and other files", () => {
		expect(isFileClassPath("a/Task.md")).toBe(false);
		expect(isFileClassPath("a/Task.fileclass.base")).toBe(false);
	});
});

describe("fileClassNameFromFile", () => {
	it("returns the basename (with .fileclass) for a fileclass note", () => {
		expect(fileClassNameFromFile({ name: "Task.fileclass.md", basename: "Task.fileclass" })).toBe(
			"Task.fileclass"
		);
	});
	it("returns undefined for a non-fileclass note", () => {
		expect(fileClassNameFromFile({ name: "Note.md", basename: "Note" })).toBeUndefined();
	});
});
