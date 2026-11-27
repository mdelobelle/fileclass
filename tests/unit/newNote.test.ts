import { describe, expect, it } from "vitest";

import {
	chooseDestination,
	destinationLabel,
	linkTarget,
	planSeeds,
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

describe("choosing a destination by name (API 1.2)", () => {
	const person = [
		{ name: "Professional", folder: "People/Work", template: "T/Pro.md" },
		{ name: "Artist", folder: "People/Artists" },
	];

	it("matches the name without regard to case", () => {
		expect(chooseDestination("Person", person, "artist")).toEqual({ ok: true, destination: person[1] });
		expect(chooseDestination("Person", person, "  PROFESSIONAL ")).toEqual({ ok: true, destination: person[0] });
	});

	it("takes the first declared destination when none is named", () => {
		expect(chooseDestination("Person", person)).toEqual({ ok: true, destination: person[0] });
		expect(chooseDestination("Person", person, "  ")).toEqual({ ok: true, destination: person[0] });
	});

	it("takes the only destination of a class that has one", () => {
		expect(chooseDestination("Book", [{ folder: "Books" }])).toEqual({ ok: true, destination: { folder: "Books" } });
	});

	it("has no destination for a class that declares none", () => {
		expect(chooseDestination("Note", [])).toEqual({ ok: true, destination: undefined });
	});

	it("refuses an unknown name and lists what the class offers", () => {
		const r = chooseDestination("Person", [...person, { folder: "People/Misc" }], "Friend");
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.message).toContain('"Friend"');
		expect(r.message).toContain("Professional, Artist, (unnamed: Misc)");
	});

	it("refuses a name on a class without destinations", () => {
		const r = chooseDestination("Note", [], "Work");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain("declares no destination");
	});
});

describe("what a link seed names", () => {
	it("takes off the wiki-link wrapping and the alias", () => {
		expect(linkTarget("AC-DC")).toBe("AC-DC");
		expect(linkTarget("[[AC-DC]]")).toBe("AC-DC");
		expect(linkTarget(" [[Bands/AC-DC|AC/DC]] ")).toBe("Bands/AC-DC");
		expect(linkTarget("Bands/AC-DC.md")).toBe("Bands/AC-DC.md");
	});
});

describe("planning the seeds", () => {
	const fields = new Set(["artists", "genre", "author", "tags"]);
	const notes: Record<string, string> = { "AC-DC": "[[AC-DC]]", "Bands/Queen.md": "[[Queen]]", "Frank Herbert": "[[Frank Herbert]]" };
	const resolve = (t: string): string | null => notes[t] ?? null;

	it("writes a literal value as is, and a list as a list", () => {
		const plan = planSeeds(
			[{ field: "genre", value: "Hard rock" }, { field: "tags", value: ["rock", "70s"] }],
			"GuitarSong",
			fields,
			resolve
		);
		expect(plan).toEqual({
			writes: [
				{ field: "genre", value: "Hard rock" },
				{ field: "tags", value: ["rock", "70s"] },
			],
			warnings: [],
		});
	});

	it("builds links from a name, a path, or a list of them", () => {
		const plan = planSeeds(
			[
				{ field: "author", linkTo: "Frank Herbert" },
				{ field: "artists", linkTo: ["AC-DC", "[[Bands/Queen.md]]"] },
			],
			"GuitarSong",
			fields,
			resolve
		);
		expect(plan.writes).toEqual([
			{ field: "author", value: "[[Frank Herbert]]" },
			{ field: "artists", value: ["[[AC-DC]]", "[[Queen]]"] },
		]);
		expect(plan.warnings).toEqual([]);
	});

	it("skips and says a seed on a field the class does not have", () => {
		const plan = planSeeds([{ field: "mood", value: "loud" }], "GuitarSong", fields, resolve);
		expect(plan.writes).toEqual([]);
		expect(plan.warnings).toEqual(['Seed "mood" ignored: "GuitarSong" has no such field.']);
	});

	it("skips and says a link that resolves to no note, keeping the ones that do", () => {
		const plan = planSeeds([{ field: "artists", linkTo: ["AC-DC", "Nobody"] }], "GuitarSong", fields, resolve);
		expect(plan.writes).toEqual([{ field: "artists", value: ["[[AC-DC]]"] }]);
		expect(plan.warnings).toEqual(['Seed "artists": no note matches "Nobody", so it was not linked.']);
		const none = planSeeds([{ field: "author", linkTo: "Nobody" }], "Book", fields, resolve);
		expect(none.writes).toEqual([]);
		expect(none.warnings).toHaveLength(1);
	});

	it("keeps the command's rules: a list flag wraps, an empty value writes nothing, the literal is the fallback", () => {
		const plan = planSeeds(
			[
				{ field: "tags", value: "todo", list: true },
				{ field: "genre", value: "" },
				{ field: "author", linkTo: "Nobody", value: "anonymous" },
			],
			"Book",
			fields,
			resolve
		);
		expect(plan.writes).toEqual([
			{ field: "tags", value: ["todo"] },
			{ field: "author", value: "anonymous" },
		]);
	});

	it("skips and says a seed of the wrong shape, without throwing (it comes from a caller's JSON)", () => {
		const seeds: unknown = [
			{ field: "artists", linkTo: [42] },
			{ field: "producer", linkTo: { path: "AC-DC" } },
			null,
			"genre=Rock",
			{ value: "no field" },
			{ field: "genre", value: "Hard rock" },
		];
		const plan = planSeeds(seeds, "GuitarSong", fields, resolve);
		expect(plan.writes).toEqual([{ field: "genre", value: "Hard rock" }]);
		expect(plan.warnings).toEqual([
			'Seed #1 ignored: `linkTo` on "artists" is not a string or a list of strings.',
			'Seed #2 ignored: `linkTo` on "producer" is not a string or a list of strings.',
			"Seed #3 ignored: it is not an object.",
			"Seed #4 ignored: it is not an object.",
			"Seed #5 ignored: `field` is not a non-empty string.",
		]);
	});

	it("reads seeds that are not a list as none, and says so", () => {
		expect(planSeeds("artists=AC-DC", "GuitarSong", fields, resolve)).toEqual({
			writes: [],
			warnings: ["Seeds ignored: `seeds` is not a list."],
		});
		expect(planSeeds(undefined, "GuitarSong", fields, resolve)).toEqual({ writes: [], warnings: [] });
	});

	it("keeps the order, so a later seed on the same field wins at write time", () => {
		const plan = planSeeds(
			[{ field: "genre", value: "Rock" }, { field: "genre", value: "Hard rock" }],
			"GuitarSong",
			fields,
			resolve
		);
		expect(plan.writes.map((w) => w.value)).toEqual(["Rock", "Hard rock"]);
	});
});
