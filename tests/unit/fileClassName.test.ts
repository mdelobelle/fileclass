import { describe, it, expect } from "vitest";

import { isFileClassPath } from "../../src/schema/constants";
import { fileClassNameFromFile } from "../../src/schema/fileClass";

describe("isFileClassPath", () => {
	it("accepts a .fileclass path anywhere", () => {
		expect(isFileClassPath("a/b/Task.fileclass")).toBe(true);
		expect(isFileClassPath("Task.fileclass")).toBe(true);
	});
	it("rejects markdown (including the old .fileclass.md form) and other files", () => {
		expect(isFileClassPath("a/Task.md")).toBe(false);
		expect(isFileClassPath("a/Task.fileclass.md")).toBe(false);
		expect(isFileClassPath("a/Task.base")).toBe(false);
	});
});

describe("fileClassNameFromFile", () => {
	it("returns the full filename for a .fileclass definition", () => {
		expect(fileClassNameFromFile({ name: "Task.fileclass" })).toBe("Task.fileclass");
	});
	it("returns undefined for a non-fileclass file", () => {
		expect(fileClassNameFromFile({ name: "Note.md" })).toBeUndefined();
		expect(fileClassNameFromFile({ name: "Task.fileclass.md" })).toBeUndefined();
	});
});
