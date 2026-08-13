import { describe, expect, it } from "vitest";

import {
	destinationLabel,
	noteDestinations,
	noteFolder,
	safeFileName,
	seedWins,
	uniquePath,
} from "../../src/schema/newNote";

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

describe("the destinations a class offers", () => {
	it("reads the list it declares", () => {
		expect(
			noteDestinations({
				newNotes: [
					{ folder: "1_People/Contacts", template: "Templates/Person pro.md" },
					{ folder: "2_Artists", template: "Templates/Person artist.md" },
				],
			})
		).toHaveLength(2);
	});

	it("drops an entry that names neither a folder nor a template", () => {
		expect(noteDestinations({ newNotes: [{}, { folder: "  " }, { template: "T.md" }] })).toEqual([
			{ folder: undefined, template: "T.md" },
		]);
	});

	it("still reads the single pair 0.2.13 wrote, as a list of one", () => {
		// A vault configured then keeps working; the options editor writes the list, so the first
		// save through it leaves the old pair behind.
		expect(
			noteDestinations({ fileClassNotesFolder: "People", fileClassNoteTemplate: "T.md" })
		).toEqual([{ folder: "People", template: "T.md" }]);
	});

	it("prefers the list when a vault carries both", () => {
		expect(
			noteDestinations({
				newNotes: [{ folder: "New" }],
				fileClassNotesFolder: "Old",
			})
		).toEqual([{ folder: "New", template: undefined }]);
	});

	it("offers nothing when the class says nothing", () => {
		expect(noteDestinations({})).toEqual([]);
		expect(noteDestinations({ filesPaths: ["Library"] })).toEqual([]);
	});
});

describe("how a destination names itself", () => {
	it("uses the last segment of each path, not the path", () => {
		// A row reading `1_People/Contacts › 3_Templater/Templates/Person pro.md` spends its width on
		// the part that distinguishes nothing.
		expect(
			destinationLabel({ folder: "1_People/Contacts", template: "3_Templater/Templates/Person pro.md" })
		).toBe("Contacts › Person pro");
	});

	it("says which folder when there is no template", () => {
		expect(destinationLabel({ folder: "2_Artists" })).toBe("2_Artists");
	});

	it("names the default folder when only a template is given", () => {
		expect(destinationLabel({ template: "Templates/Person.md" })).toBe("the default folder › Person");
	});

	it("falls back when it holds nothing", () => {
		expect(destinationLabel({})).toBe("New note");
	});
});

describe("the folder a chosen destination lands in", () => {
	it("wins over everything else", () => {
		expect(
			noteFolder({ fileClassNotesFolder: "Old", filesPaths: ["Bound"] }, "Inbox", { folder: "Chosen" })
		).toBe("Chosen");
	});

	it("falls back through the cascade when the destination names no folder", () => {
		// A destination may be a template alone — "same folder as always, different starting point".
		expect(noteFolder({ filesPaths: ["Bound"] }, "Inbox", { template: "T.md" })).toBe("Bound");
	});
});
