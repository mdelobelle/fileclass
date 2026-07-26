/*
 * Issue #47: candidates and Select/Multi values sourced from a base follow the
 * view's own row order. The order itself comes from getBaseRows (canary-verified
 * against real Bases); these unit tests cover the pure mapping that turns those
 * ordered rows into displays / allowed values.
 */
import { describe, expect, it } from "vitest";

import { ValueRow, distinctColumnValues, rowDisplay } from "../../src/fields/baseOrder";

const r = (values: Record<string, string | null>): ValueRow => ({ values });

describe("rowDisplay", () => {
	it("uses the display column value when set and non-empty", () => {
		expect(rowDisplay(r({ "note.title": "Alpha" }), "note.title", "a")).toBe("Alpha");
	});
	it("falls back to the fallback when the column value is null or the column is missing", () => {
		expect(rowDisplay(r({ "note.title": null }), "note.title", "b")).toBe("b");
		expect(rowDisplay(r({}), "note.title", "c")).toBe("c");
	});
	it("uses the fallback when no display column is configured", () => {
		expect(rowDisplay(r({ "note.title": "X" }), undefined, "name")).toBe("name");
	});
});

describe("distinctColumnValues", () => {
	it("keeps first-seen (view) order and drops duplicates", () => {
		const rows = [r({ c: "Paris" }), r({ c: "Lyon" }), r({ c: "Paris" })];
		expect(distinctColumnValues(rows, "c")).toEqual(["Paris", "Lyon"]);
	});
	it("skips null and empty values", () => {
		const rows = [r({ c: "Paris" }), r({ c: null }), r({ c: "" }), r({ c: "Nice" })];
		expect(distinctColumnValues(rows, "c")).toEqual(["Paris", "Nice"]);
	});
	it("returns an empty list when no row has the column", () => {
		expect(distinctColumnValues([r({}), r({ other: "x" })], "c")).toEqual([]);
	});
});
