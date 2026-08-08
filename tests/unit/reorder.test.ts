import { describe, expect, it } from "vitest";

import { Field } from "../../src/schema/field";
import { isIntegerLikeKey, reorderPlan, unpositionableKeys } from "../../src/schema/reorder";

const field = (name: string, path = ""): Field => ({
	id: name.slice(0, 6),
	name,
	type: "Input",
	options: [],
	path,
	fileClassName: "Book",
});

const book = [field("author"), field("publisher"), field("pages"), field("read")];

describe("reorderPlan", () => {
	it("puts the class's keys in the class's order", () => {
		const plan = reorderPlan(book, ["pages", "author", "read"], "bottom");
		expect(plan).toEqual(["author", "pages", "read"]);
	});

	it("returns null when the keys are already in order — nothing must be written", () => {
		// The load-bearing case: a reorder that rewrote every note on every pass would be
		// worse than the disorder it fixes.
		expect(reorderPlan(book, ["author", "publisher", "pages"], "bottom")).toBeNull();
		expect(reorderPlan(book, ["fileClass", "author", "pages"], "top")).toBeNull();
	});

	it("never invents or drops a key", () => {
		const keys = ["read", "fileClass", "author", "cover"];
		const plan = reorderPlan(book, keys, "top") ?? keys;
		expect([...plan].sort()).toEqual([...keys].sort());
	});

	it("leaves out fields the note does not carry", () => {
		// Inserting is `insertMissingFields`' job; a reorder that added keys would be a
		// different command wearing this one's name.
		const plan = reorderPlan(book, ["read", "author"], "bottom");
		expect(plan).toEqual(["author", "read"]);
	});

	it("ignores nested fields: this plans top-level keys only", () => {
		const withChild = [...book, field("year", "edId"), field("publisher", "edId")];
		expect(reorderPlan(withChild, ["pages", "author"], "bottom")).toEqual(["author", "pages"]);
	});

	describe("keys the class knows nothing about", () => {
		const keys = ["pages", "tags", "author", "aliases"];

		it("top (the default): they open the block, where tags and aliases already sit", () => {
			expect(reorderPlan(book, keys)).toEqual(["tags", "aliases", "author", "pages"]);
		});

		it("bottom: the class's keys first, the rest after, in their own order", () => {
			expect(reorderPlan(book, keys, "bottom")).toEqual(["author", "pages", "tags", "aliases"]);
		});

		it("keep-relative: each one keeps its neighbours, the known keys fill their slots", () => {
			expect(reorderPlan(book, keys, "keep-relative")).toEqual([
				"author",
				"tags",
				"pages",
				"aliases",
			]);
		});
	});

	it("plans a duplicate-free order even if a class declares a name twice", () => {
		const twice = [...book, field("author")];
		const plan = reorderPlan(twice, ["pages", "author"], "bottom");
		expect(plan).toEqual(["author", "pages"]);
	});
});

describe("keys YAML will move whatever we ask", () => {
	it("recognises integer-like keys", () => {
		expect(isIntegerLikeKey("2024")).toBe(true);
		expect(isIntegerLikeKey("2024 edition")).toBe(false);
		expect(isIntegerLikeKey("author")).toBe(false);
	});

	it("reports them from a plan, so a caller can warn instead of lying", () => {
		expect(unpositionableKeys(["author", "2024", "pages"])).toEqual(["2024"]);
		expect(unpositionableKeys(["author", "pages"])).toEqual([]);
	});
});
