/*
 * Issue #47: candidates and Select/Multi values sourced from a base follow the
 * view's own row order. The order itself comes from getBaseRows (canary-verified
 * against real Bases); these unit tests cover the pure mapping that turns those
 * ordered rows into displays / allowed values.
 */
import { describe, expect, it } from "vitest";

import {
	GroupableItem,
	ValueRow,
	contiguousGroups,
	distinctColumnValues,
	groupLabel,
	rowDisplay,
} from "../../src/fields/baseOrder";

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

describe("contiguousGroups", () => {
	const item = (display: string, group?: string | null): GroupableItem => ({ display, group });

	it("returns undefined when no item is grouped (view has no groupBy)", () => {
		expect(contiguousGroups([item("a"), item("b")])).toBeUndefined();
	});

	it("collapses group-ordered items into contiguous groups", () => {
		const groups = contiguousGroups([
			item("Alpha", "read"),
			item("Gamma", "read"),
			item("Beta", "reading"),
		]);
		expect(groups).toEqual([
			{ key: "read", values: ["Alpha", "Gamma"] },
			{ key: "reading", values: ["Beta"] },
		]);
	});

	it("maps the keyless group to a null key", () => {
		const groups = contiguousGroups([item("x", "read"), item("y", null)]);
		expect(groups).toEqual([
			{ key: "read", values: ["x"] },
			{ key: null, values: ["y"] },
		]);
	});

	it("starts a new run when a key repeats non-contiguously", () => {
		const groups = contiguousGroups([item("a", "g1"), item("b", "g2"), item("c", "g1")]);
		expect(groups?.map((g) => g.key)).toEqual(["g1", "g2", "g1"]);
	});
});

describe("groupLabel", () => {
	it("labels the keyless group and echoes named keys", () => {
		expect(groupLabel(null)).toBe("(No value)");
		expect(groupLabel("read")).toBe("read");
	});
});
