import { describe, it, expect } from "vitest";

import { mergeFileClassLink } from "../../src/ui/fileClassLinkValue";

describe("mergeFileClassLink", () => {
	it("appends to an existing array", () => {
		expect(mergeFileClassLink(["[[Area.fileclass]]"], "[[Task.fileclass]]")).toEqual([
			"[[Area.fileclass]]",
			"[[Task.fileclass]]",
		]);
	});
	it("wraps a scalar and appends", () => {
		expect(mergeFileClassLink("[[Area.fileclass]]", "[[Task.fileclass]]")).toEqual([
			"[[Area.fileclass]]",
			"[[Task.fileclass]]",
		]);
	});
	it("is idempotent", () => {
		expect(mergeFileClassLink(["[[Area.fileclass]]"], "[[Area.fileclass]]")).toEqual([
			"[[Area.fileclass]]",
		]);
	});
	it("treats empty/undefined as []", () => {
		expect(mergeFileClassLink(undefined, "[[Task.fileclass]]")).toEqual(["[[Task.fileclass]]"]);
		expect(mergeFileClassLink("", "[[Task.fileclass]]")).toEqual(["[[Task.fileclass]]"]);
	});
});
