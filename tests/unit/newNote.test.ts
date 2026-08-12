import { describe, expect, it } from "vitest";

import { noteFolder, safeFileName, seedWins, uniquePath } from "../../src/schema/newNote";
import { reverseFieldOfView } from "../../src/views/reverseView";

describe("where a new note goes", () => {
	it("uses the class's own folder when it declares one", () => {
		expect(noteFolder({ fileClassNotesFolder: "Reading list", filesPaths: ["Elsewhere"] }, "Inbox")).toBe(
			"Reading list"
		);
	});

	it("falls back to the single folder the class already binds", () => {
		// A class bound to one folder has said where its notes live; asking twice would be a second
		// answer to the same question.
		expect(noteFolder({ filesPaths: ["Reading list"] }, "Inbox")).toBe("Reading list");
	});

	it("does not pick between several bound folders", () => {
		// Choosing the first would be a coin toss dressed up as a decision.
		expect(noteFolder({ filesPaths: ["A", "B"] }, "Inbox")).toBe("Inbox");
	});

	it("falls back to Obsidian's default when the class says nothing", () => {
		expect(noteFolder({}, "Inbox")).toBe("Inbox");
		expect(noteFolder({ filesPaths: [] }, "")).toBe("");
	});

	it("ignores trailing slashes wherever they come from", () => {
		expect(noteFolder({ fileClassNotesFolder: "Reading list/" }, "")).toBe("Reading list");
		expect(noteFolder({ filesPaths: ["Reading list//"] }, "")).toBe("Reading list");
		expect(noteFolder({}, "Inbox/")).toBe("Inbox");
	});

	it("treats a blank option as unset rather than as the vault root", () => {
		expect(noteFolder({ fileClassNotesFolder: "   ", filesPaths: ["Reading list"] }, "Inbox")).toBe(
			"Reading list"
		);
	});
});

describe("the file name", () => {
	it("strips what Obsidian will not accept, rather than refusing the name", () => {
		expect(safeFileName('Dune: part two', "Book")).toBe("Dune part two");
		expect(safeFileName("a/b\\c*d?e", "Book")).toBe("abcde");
	});

	it("falls back when nothing usable is left", () => {
		expect(safeFileName("", "Book")).toBe("Book");
		expect(safeFileName("///", "Book")).toBe("Book");
		expect(safeFileName("...", "Book")).toBe("Book");
	});

	it("keeps ordinary punctuation", () => {
		expect(safeFileName("Tintin & Milou (1929)", "Book")).toBe("Tintin & Milou (1929)");
	});
});

describe("the path it lands on", () => {
	const taken = (...paths: string[]) => (p: string) => paths.includes(p);

	it("is the plain one when it is free", () => {
		expect(uniquePath("Reading list", "Dune", taken())).toBe("Reading list/Dune.md");
	});

	it("numbers like Obsidian rather than failing on a name that exists", () => {
		expect(uniquePath("Reading list", "Dune", taken("Reading list/Dune.md"))).toBe("Reading list/Dune 1.md");
		expect(
			uniquePath("Reading list", "Dune", taken("Reading list/Dune.md", "Reading list/Dune 1.md"))
		).toBe("Reading list/Dune 2.md");
	});

	it("works at the vault root", () => {
		expect(uniquePath("", "Dune", taken())).toBe("Dune.md");
	});
});

describe("what a seed overrides", () => {
	const seed = { field: "author", label: "New Book with A1" };

	it("wins over a value the template set, on its own field only", () => {
		// Clicking "New Book with Frank Herbert" is an instruction about that field; a template's
		// default is a general preference.
		expect(seedWins("Somebody else", seed, "author")).toBe(true);
		expect(seedWins("Chilton Books", seed, "publisher")).toBe(false);
	});

	it("is not consulted when there is no seed", () => {
		expect(seedWins("x", undefined, "author")).toBe(false);
	});
});

describe("reading a reverse view's field back from its name", () => {
	it("inverts the convention exactly, rather than parsing prose", () => {
		expect(reverseFieldOfView("Book", "Book by author", ["author", "cover"])).toBe("author");
	});

	it("says nothing about a view that is not one of ours", () => {
		expect(reverseFieldOfView("Book", "All books", ["author"])).toBeUndefined();
		expect(reverseFieldOfView("Book", "Book by author", ["cover"])).toBeUndefined();
	});

	it("copes with a field name that contains the word by", () => {
		expect(reverseFieldOfView("Book", "Book by written by", ["written by"])).toBe("written by");
	});
});
