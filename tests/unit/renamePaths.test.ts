import { describe, expect, it } from "vitest";

import {
	RenameEvent,
	consequenceOf,
	describeStale,
	pathMatchesRename,
	referenceLabel,
	staleReferences,
} from "../../src/schema/renamePaths";

const file = (oldPath: string, newPath: string): RenameEvent => ({ oldPath, newPath, isFolder: false });
const folder = (oldPath: string, newPath: string): RenameEvent => ({ oldPath, newPath, isFolder: true });

describe("which stored paths a rename makes stale", () => {
	it("recognises the path that was renamed", () => {
		expect(pathMatchesRename("Values/Rating.md", file("Values/Rating.md", "Values/R-2026.md"))).toBe(true);
	});

	it("leaves any other path out of it", () => {
		expect(pathMatchesRename("Values/Other.md", file("Values/Rating.md", "x.md"))).toBe(false);
		expect(pathMatchesRename("", file("a.md", "b.md"))).toBe(false);
	});

	it("does not mistake a shared prefix for the same file", () => {
		// `Values/Rating.md` and `Values/Rating-2.md` are two different notes.
		expect(pathMatchesRename("Values/Rating-2.md", file("Values/Rating.md", "x.md"))).toBe(false);
	});

	it("recognises a note path stored without its extension", () => {
		// The resolver accepts both forms, so warning about one only would look arbitrary.
		expect(pathMatchesRename("Values/Rating", file("Values/Rating.md", "Values/R.md"))).toBe(true);
	});

	it("carries everything under a renamed folder", () => {
		expect(pathMatchesRename("Reading list", folder("Reading list", "Library"))).toBe(true);
		expect(pathMatchesRename("Reading list/Archive", folder("Reading list", "Library"))).toBe(true);
	});

	it("does not touch a folder that merely starts with the same letters", () => {
		expect(pathMatchesRename("Reading lists", folder("Reading list", "Library"))).toBe(false);
	});

	it("treats a move as a rename, because it is one", () => {
		expect(pathMatchesRename("Values/Rating.md", file("Values/Rating.md", "Archive/Rating.md"))).toBe(true);
	});
});

describe("what a class note still names", () => {
	const schema = () => ({
		fields: [
			{
				name: "rating",
				options: { sourceType: "ValuesListNotePath", valuesListNotePath: "Values/Rating.md" },
			},
			{ name: "author", options: { baseFile: "Authors.base", viewName: "All authors" } },
			{ name: "leads to", options: { canvasPath: "Reading map.canvas", direction: "outgoing" } },
			{ name: "pages", options: { min: 1 } },
		],
		baseFile: "Books.base",
		filesPaths: ["Reading list", "Elsewhere"],
	});

	it("finds the note a Select draws its values from", () => {
		expect(staleReferences(schema(), file("Values/Rating.md", "Values/R-2026.md"))).toEqual([
			{ field: "rating", key: "valuesListNotePath", path: "Values/Rating.md" },
		]);
	});

	it("finds a base a field takes its candidates from", () => {
		expect(staleReferences(schema(), file("Authors.base", "Writers.base"))).toEqual([
			{ field: "author", key: "baseFile", path: "Authors.base" },
		]);
	});

	it("finds a canvas a field is bound to", () => {
		expect(staleReferences(schema(), file("Reading map.canvas", "Map.canvas"))).toEqual([
			{ field: "leads to", key: "canvasPath", path: "Reading map.canvas" },
		]);
	});

	it("finds the class's own base", () => {
		expect(staleReferences(schema(), file("Books.base", "Library.base"))).toEqual([
			{ field: undefined, key: "baseFile", path: "Books.base" },
		]);
	});

	it("finds a folder the class claims — the one that costs notes their class", () => {
		expect(staleReferences(schema(), folder("Reading list", "Library"))).toEqual([
			{ key: "filesPaths", path: "Reading list" },
		]);
	});

	it("says nothing about a folder binding when a file was renamed", () => {
		expect(staleReferences(schema(), file("Reading list", "Library"))).toEqual([]);
	});

	it("says nothing for an unrelated rename, and changes nothing either", () => {
		const fm = schema();
		const before = JSON.stringify(fm);
		expect(staleReferences(fm, file("Somewhere/Else.md", "Other.md"))).toEqual([]);
		// Detection only: the schema is the author's, and this module never edits it.
		expect(JSON.stringify(fm)).toBe(before);
	});

	it("leaves a user's own path-shaped option out of it", () => {
		const fm = { fields: [{ name: "x", options: { myOwnPath: "Values/Rating.md" } }] };
		expect(staleReferences(fm, file("Values/Rating.md", "New.md"))).toEqual([]);
	});

	it("survives frontmatter that is not shaped like a schema", () => {
		expect(staleReferences({}, file("a.md", "b.md"))).toEqual([]);
		expect(staleReferences({ fields: "not a list" }, file("a.md", "b.md"))).toEqual([]);
		expect(staleReferences({ fields: [null, { options: null }] }, file("a.md", "b.md"))).toEqual([]);
	});
});

describe("what the warning says", () => {
	it("names the class and the field to open", () => {
		expect(referenceLabel("Book", { field: "rating", key: "valuesListNotePath", path: "p" })).toBe(
			"Book › rating"
		);
		expect(referenceLabel("Book", { key: "filesPaths", path: "p" })).toBe("Book › filesPaths");
	});

	it("says what moved, where it is still named, and what happens if you leave it", () => {
		const text = describeStale("Values/Rating.md", ["Book › rating"], "the field offers no values");
		expect(text).toContain('"Values/Rating.md" moved');
		expect(text).toContain("Book › rating");
		expect(text).toContain("Until the definition is updated");
		expect(text).toContain("the field offers no values");
	});

	it("caps the list, since a notice is read at a glance", () => {
		const text = describeStale("a.md", ["A › x", "B › y", "C › z", "D › w", "E › v"], "x");
		expect(text).toContain("A › x, B › y, C › z");
		expect(text).toContain("and 2 more");
		expect(text).not.toContain("D › w");
	});

	it("stays grammatical for a single reference", () => {
		expect(describeStale("a.md", ["Book › rating"], "x")).toContain("a fileClass still points at it");
		expect(describeStale("a.md", ["Book › rating", "Comic › x"], "x")).toContain(
			"fileClasses still point at it"
		);
	});
});

describe("what each stale reference actually costs", () => {
	it("does not say the same thing about every key", () => {
		// A folder binding feeds no values: it decides which notes carry the class at all, and the
		// generic wording was wrong in exactly the case with the most teeth.
		expect(consequenceOf({ key: "filesPaths", path: "p" })).toBe(
			"notes in that folder no longer carry the class"
		);
		expect(consequenceOf({ field: "rating", key: "valuesListNotePath", path: "p" })).toBe(
			"the field offers no values"
		);
		expect(consequenceOf({ field: "leads to", key: "canvasPath", path: "p" })).toBe(
			"the field stops following the canvas"
		);
	});

	it("tells a field's base from a class's", () => {
		expect(consequenceOf({ field: "author", key: "baseFile", path: "p" })).toBe(
			"the field offers no candidates"
		);
		expect(consequenceOf({ key: "baseFile", path: "p" })).toBe("the class has no base to sync");
	});
});
