import { describe, expect, it } from "vitest";

import {
	frontmatterEnd,
	frontmatterPathAt,
	frontmatterValueAt,
	inlineListToBlock,
	lineOfPath,
	unquote,
	yamlScalar,
} from "../../src/io/frontmatterCaret";

const lines = [
	"---",
	"fileClass: Book",
	"genre: Science fic",
	"themes:",
	"  - Ecology",
	"  - ",
	"storage:",
	"  room: Study",
	"---",
	"",
	"genre: not frontmatter",
];

/** Caret at the end of the given line. */
const atEnd = (line: number) => frontmatterValueAt(lines, line, lines[line].length);

describe("frontmatterEnd", () => {
	it("finds the closing fence", () => {
		expect(frontmatterEnd(lines)).toBe(8);
	});

	it("answers -1 for a file that does not open with one", () => {
		expect(frontmatterEnd(["# Title", "---"])).toBe(-1);
		expect(frontmatterEnd(["---", "a: 1"])).toBe(-1);
	});
});

describe("frontmatterValueAt", () => {
	it("names the key whose value the caret is in, and what has been typed", () => {
		expect(atEnd(2)).toEqual({ key: "genre", query: "Science fic", from: 7, to: 18, list: false, spaced: true });
	});

	it("answers nothing while the caret is in the key", () => {
		expect(frontmatterValueAt(lines, 2, 3)).toBeNull();
	});

	it("answers nothing on the fences, or outside the block", () => {
		expect(frontmatterValueAt(lines, 0, 0)).toBeNull();
		expect(frontmatterValueAt(lines, 8, 0)).toBeNull();
		// Same text as a real key line, but below the block — a body line is not a value.
		expect(frontmatterValueAt(lines, 10, 12)).toBeNull();
	});

	it("attributes a list item to the key above it", () => {
		expect(atEnd(4)).toEqual({ key: "themes", query: "Ecology", from: 4, to: 11, list: true, spaced: true });
		expect(atEnd(5)).toEqual({ key: "themes", query: "", from: 4, to: 4, list: true, spaced: true });
	});

	it("attributes a nested key to itself, not to the block holding it", () => {
		expect(atEnd(7)).toEqual({ key: "room", query: "Study", from: 8, to: 13, list: false, spaced: true });
	});

	it("reads one item of an inline list, not the whole value", () => {
		// It used to refuse these outright; an inline list is the notation some vaults are written
		// in, and refusing it left the one shape a suggester could not help with.
		const inline = ["---", "themes: [Ecology, Religion]", "---"];
		expect(frontmatterValueAt(inline, 1, 20)).toMatchObject({ key: "themes", list: true, inline: true });
	});

	it("refuses a comment", () => {
		const commented = ["---", "# genre: Science fiction", "---"];
		expect(frontmatterValueAt(commented, 1, 20)).toBeNull();
	});

	it("gives the range from the value's start to the end of the line", () => {
		// What a suggestion replaces: the whole value, not the word under the caret — a chosen
		// candidate is the value, and half of what was typed must not survive it.
		const caret = frontmatterValueAt(lines, 2, 10);
		expect(caret).toMatchObject({ from: 7, to: 18, query: "Sci" });
	});

	it("takes a list item with no key above it as no value at all", () => {
		expect(frontmatterValueAt(["---", "  - orphan", "---"], 1, 10)).toBeNull();
	});
});

describe("unquote", () => {
	it("reads what was typed inside quotes", () => {
		expect(unquote('"Scie')).toBe("Scie");
		expect(unquote("'Science fiction'")).toBe("Science fiction");
		expect(unquote("  Science  ")).toBe("Science");
	});
});

const nested = [
	"---",
	"fileClass: Book",
	"genre: Science fiction",
	"themes:",
	"  - Ecology",
	"  - Religion",
	"storage:",
	"  room: Study",
	"  shelf: A-3",
	"editions:",
	"  - format: Paperback",
	"    year: 1990",
	"  - format: Hardcover",
	"    year: 1965",
	"---",
];

const pathAt = (line: number) => frontmatterPathAt(nested, line, nested[line].length);

describe("frontmatterPathAt", () => {
	it("names a root field", () => {
		expect(pathAt(2)).toEqual({ keys: ["genre"], itemIndex: undefined });
	});

	it("attributes a list item to its key, with its position", () => {
		expect(pathAt(4)).toEqual({ keys: ["themes"], itemIndex: 0 });
		expect(pathAt(5)).toEqual({ keys: ["themes"], itemIndex: 1 });
	});

	it("reaches a child of an object through its parent", () => {
		expect(pathAt(7)).toEqual({ keys: ["storage", "room"], itemIndex: undefined });
		expect(pathAt(8)).toEqual({ keys: ["storage", "shelf"], itemIndex: undefined });
	});

	it("tells one item of an object list from another", () => {
		// The whole point of the index: `year` on line 11 is *the first edition's* year.
		expect(pathAt(10)).toEqual({ keys: ["editions", "format"], itemIndex: 0 });
		expect(pathAt(11)).toEqual({ keys: ["editions", "year"], itemIndex: 0 });
		expect(pathAt(12)).toEqual({ keys: ["editions", "format"], itemIndex: 1 });
		expect(pathAt(13)).toEqual({ keys: ["editions", "year"], itemIndex: 1 });
	});

	it("names the group itself when the caret is on its key", () => {
		expect(pathAt(9)).toEqual({ keys: ["editions"], itemIndex: undefined });
		expect(pathAt(6)).toEqual({ keys: ["storage"], itemIndex: undefined });
	});

	it("answers nothing outside the block", () => {
		expect(frontmatterPathAt(nested, 0, 0)).toBeNull();
		expect(frontmatterPathAt(nested, 14, 0)).toBeNull();
	});
});

describe("lineOfPath", () => {
	it("finds the line a chain sits on, so the caret can go back to it", () => {
		expect(lineOfPath(nested, { keys: ["genre"] })).toBe(2);
		expect(lineOfPath(nested, { keys: ["storage", "shelf"] })).toBe(8);
	});

	it("distinguishes the items of a list", () => {
		expect(lineOfPath(nested, { keys: ["editions", "year"], itemIndex: 1 })).toBe(13);
	});

	it("answers nothing for a chain the note does not carry", () => {
		expect(lineOfPath(nested, { keys: ["missing"] })).toBeNull();
	});
});

describe("yamlScalar", () => {
	it("leaves an ordinary value alone", () => {
		expect(yamlScalar("Science fiction")).toBe("Science fiction");
		expect(yamlScalar("Blake & Mortimer")).toBe("Blake & Mortimer");
	});

	it("quotes what would parse as something other than a string", () => {
		expect(yamlScalar("true")).toBe('"true"');
		expect(yamlScalar("42")).toBe('"42"');
		expect(yamlScalar("null")).toBe('"null"');
	});

	it("quotes a value YAML would read as structure", () => {
		expect(yamlScalar("Vol 2: the return")).toBe('"Vol 2: the return"');
		expect(yamlScalar("- dash first")).toBe('"- dash first"');
		expect(yamlScalar("#tagish")).toBe('"#tagish"');
	});

	it("quotes the empty value and one with edge whitespace", () => {
		expect(yamlScalar("")).toBe('""');
		expect(yamlScalar(" padded ")).toBe('" padded "');
	});

	it("escapes the quotes it adds", () => {
		expect(yamlScalar('say "hi": now')).toBe('"say \\"hi\\": now"');
	});
});

describe("frontmatterValueAt — inline lists", () => {
	const inline = (text: string, ch: number) => frontmatterValueAt(["---", text, "---"], 1, ch);

	it("offers inside an empty inline list, where the value goes", () => {
		// `themes: [|]` — nothing typed yet, and the item starts and ends at the caret.
		expect(inline("themes: []", 9)).toEqual({
			key: "themes",
			query: "",
			from: 9,
			to: 9,
			list: true,
			inline: true,
			spaced: true,
		});
	});

	it("reads the item being typed, not the whole line", () => {
		expect(inline("themes: [Ecology, Rel]", 21)).toMatchObject({ key: "themes", query: "Rel", from: 18, to: 21 });
	});

	it("replaces one item, leaving the others alone", () => {
		// Caret in the first item of two: the range stops at the comma.
		expect(inline("themes: [Eco, Religion]", 12)).toMatchObject({ query: "Eco", from: 9, to: 12 });
	});

	it("refuses a caret outside the brackets", () => {
		expect(inline("themes: []", 10)).toBeNull(); // after the closing bracket
		expect(inline("themes: [a]", 8)).toBeNull(); // on the opening one
	});

	it("still refuses an inline mapping, which is not a list of values", () => {
		expect(inline("storage: {room: Study}", 20)).toBeNull();
	});
});

describe("inlineListToBlock", () => {
	it("turns an empty inline list into the value on its own line", () => {
		// The shape the user asked for: the `[]` goes, and a line arrives.
		expect(inlineListToBlock("themes: []", "Religion", "")).toEqual(["themes:", "  - Religion"]);
	});

	it("keeps the items already there, in order", () => {
		expect(inlineListToBlock("themes: [Ecology]", "Religion", "")).toEqual([
			"themes:",
			"  - Ecology",
			"  - Religion",
		]);
	});

	it("replaces the item being typed rather than keeping it beside the value", () => {
		expect(inlineListToBlock("themes: [Ecology, Rel]", "Religion", "Rel")).toEqual([
			"themes:",
			"  - Ecology",
			"  - Religion",
		]);
	});

	it("keeps a nested key at its own indentation", () => {
		expect(inlineListToBlock("  tags: [a]", "b", "")).toEqual(["  tags:", "    - a", "    - b"]);
	});

	it("quotes an item that needs it", () => {
		expect(inlineListToBlock("themes: []", "Vol 2: the return", "")).toEqual([
			"themes:",
			'  - "Vol 2: the return"',
		]);
	});

	it("answers nothing for a line that holds no inline list", () => {
		expect(inlineListToBlock("themes:", "Religion", "")).toBeNull();
		expect(inlineListToBlock("genre: Science fiction", "Religion", "")).toBeNull();
	});
});

describe("frontmatterValueAt — the separator YAML needs", () => {
	const at = (text: string, ch: number) => frontmatterValueAt(["---", text, "---"], 1, ch);

	it("knows when the value starts right after the colon", () => {
		// `Status:OnGoing` is one scalar string, not a key and a value: whoever writes there has to
		// put the space back.
		expect(at("Status:Wa", 9)).toMatchObject({ key: "Status", query: "Wa", spaced: false });
		expect(at("Status: Wa", 10)).toMatchObject({ spaced: true });
	});

	it("knows the same of a list item", () => {
		const lines = ["---", "themes:", "  -Eco", "---"];
		expect(frontmatterValueAt(lines, 2, 6)).toMatchObject({ key: "themes", query: "Eco", spaced: false });
	});
});
