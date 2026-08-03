import { describe, expect, it } from "vitest";

// The demo runner is plain JS; `spokenText` carries JSDoc types, so this needs no
// cast. Only its pure text transform is exercised here — nothing launches Obsidian.
import { spokenText } from "../../demo/lib/voice.mjs";

const spoken = (title: string, extra?: Record<string, string>): string =>
	spokenText(title, extra ?? null);

describe("spokenText — what the narrator actually says", () => {
	it("spells an id, which `say` otherwise reads as the word", () => {
		// Measured with the demo voice: `say "I D"` and `say "eye dee"` render
		// byte-identical audio, while "id" and "ID" each render something else.
		expect(spoken("what gets stored is its id, plain text")).toBe(
			"what gets stored is its I D, plain text"
		);
		expect(spoken("the ID of an icon")).toBe("the I D of an icon");
		expect(spoken("two ids, two IDs")).toBe("two I Ds, two I Ds");
	});

	it("leaves words that merely contain those letters alone", () => {
		// The reason id is a whole-word rule: the table itself is a substring
		// replacement, which would otherwise eat the middle of these.
		expect(spoken("every video and guide keeps its identifier")).toBe(
			"every video and guide keeps its identifier"
		);
	});

	it("still fixes identifiers by substring, plurals included", () => {
		expect(spoken("two fileClasses share a fileClass alias")).toBe(
			"two file classes share a file class alias"
		);
	});

	it("drops emoji and gives an em dash a breath", () => {
		expect(spoken("The rest is in the docs 🎉")).toBe("The rest is in the docs");
		expect(spoken("one shape — one value")).toBe("one shape, one value");
	});

	it("lets a scenario override the shared table", () => {
		expect(spoken("YAML", { YAML: "why a m l" })).toBe("why a m l");
	});
});

describe("a take number is read, not spelled", () => {
	it("says sixteen where the script writes 016", () => {
		// `say` reads the padded form digit by digit ("oh one six"), which is nobody's
		// way of naming a take.
		expect(spoken("Since take 016 a book says where it is shelved")).toBe(
			"Since take 16 a book says where it is shelved"
		);
		expect(spoken("take 007")).toBe("take 7");
	});

	it("keeps the letter of a b-take, as a separate word", () => {
		expect(spoken("as take 016b showed")).toBe("as take 16 b showed");
	});

	it("leaves versions and dates alone", () => {
		expect(spoken("0.2.3 shipped on 2028-04-20")).toBe("0.2.3 shipped on 2028-04-20");
	});
});

describe("coordinates are said, not clipped", () => {
	it("reads lat, lon as latitude and longitude", () => {
		expect(spoken("what is stored stays a plain lat, lon")).toBe(
			"what is stored stays a plain latitude and longitude"
		);
		expect(spoken("a plain lat,lon pair")).toBe("a plain latitude and longitude pair");
	});

	it("leaves the caption's own words alone otherwise", () => {
		// "latitude" and "longitude" spelled out already must not be doubled up.
		expect(spoken("Two fields, latitude and longitude, each checked as you type")).toBe(
			"Two fields, latitude and longitude, each checked as you type"
		);
	});
});
