/*
 * Recognising the class-files folder. The setting carries a trailing slash and
 * Obsidian's folder paths don't, which is the whole reason this exists.
 */
import { describe, expect, it } from "vitest";

import { isClassFolder, isInClassFolder } from "../../src/schema/classFolder";

describe("isClassFolder", () => {
	it("matches the configured folder however either side is written", () => {
		for (const folder of ["Classes", "Classes/", "/Classes", "/Classes/"]) {
			expect(isClassFolder(folder, "Classes/"), folder).toBe(true);
		}
	});

	it("matches a nested class folder", () => {
		expect(isClassFolder("Meta/Classes", "Meta/Classes/")).toBe(true);
	});

	it("rejects a folder that merely contains it, or sits inside it", () => {
		expect(isClassFolder("Meta", "Meta/Classes/")).toBe(false);
		expect(isClassFolder("Classes/Archive", "Classes/")).toBe(false);
	});

	it("rejects everything when no folder is configured", () => {
		expect(isClassFolder("Classes", "")).toBe(false);
		expect(isClassFolder("", "")).toBe(false);
	});

	it("is not fooled by a same-prefix sibling", () => {
		expect(isClassFolder("Classes2", "Classes/")).toBe(false);
	});
});

describe("isInClassFolder", () => {
	it("accepts a note directly inside, and deeper", () => {
		expect(isInClassFolder("Classes/Book.md", "Classes/")).toBe(true);
		expect(isInClassFolder("Classes/Media/Book.md", "Classes/")).toBe(true);
	});

	it("rejects the folder itself and a sibling with the same prefix", () => {
		expect(isInClassFolder("Classes", "Classes/")).toBe(false);
		expect(isInClassFolder("Classes2/Book.md", "Classes/")).toBe(false);
	});

	it("treats a vault-root setting as everything", () => {
		expect(isInClassFolder("Book.md", "/")).toBe(true);
	});

	it("rejects everything when no folder is configured", () => {
		expect(isInClassFolder("Classes/Book.md", "")).toBe(false);
	});
});
