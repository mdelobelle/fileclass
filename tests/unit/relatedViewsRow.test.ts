import { describe, expect, it } from "vitest";

import { relatedViewLines } from "../../src/schema/relatedViewsRow";

const there = () => true;
const nowhere = () => false;

describe("relatedViewLines", () => {
	it("reads a relation as the field and the view it reaches", () => {
		const value = [{ field: "author", view: "Books.base#A's Bs" }];
		expect(relatedViewLines(value, there)).toEqual([
			{ field: "author", label: "Books › A's Bs", target: { path: "Books.base", viewName: "A's Bs" }, missing: false },
		]);
	});

	it("names the base by its file, without the folders or the extension", () => {
		const value = [{ field: "author", view: "Bases/Library/Books.base#All" }];
		expect(relatedViewLines(value, there)[0].label).toBe("Books › All");
	});

	it("keeps the declaration order — a class can reach the same parent twice", () => {
		const value = [
			{ field: "editor", view: "Books.base#Edited" },
			{ field: "author", view: "Books.base#Written" },
		];
		expect(relatedViewLines(value, there).map((l) => l.field)).toEqual(["editor", "author"]);
	});

	it("marks a base that is declared but not in the vault", () => {
		const value = [{ field: "author", view: "Gone.base#A's Bs" }];
		const [line] = relatedViewLines(value, nowhere);
		expect(line.missing).toBe(true);
		expect(line.target).toEqual({ path: "Gone.base", viewName: "A's Bs" });
	});

	it("shows a malformed reference as it stands, with nowhere to go", () => {
		const value = [{ field: "author", view: "Books.base" }];
		expect(relatedViewLines(value, there)).toEqual([
			{ field: "author", label: "Books.base", target: null, missing: true },
		]);
	});

	it("ignores anything that is not a declaration", () => {
		expect(relatedViewLines(undefined, there)).toEqual([]);
		expect(relatedViewLines("Books.base#All", there)).toEqual([]);
		expect(relatedViewLines([{ field: "author" }, { view: "Books.base#All" }, null], there)).toEqual([]);
	});
});
