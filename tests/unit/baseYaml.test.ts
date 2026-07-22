import { describe, expect, it } from "vitest";

import { buildBaseYaml, isBaseViewSynced, mirrorBaseView } from "../../src/views/baseYaml";

describe("buildBaseYaml", () => {
	it("filters on the alias and lists file.name + fields", () => {
		const yaml = buildBaseYaml("Book", ["author", "rating"], "fileClass");
		expect(yaml).toBe(
			[
				"filters:",
				"  and:",
				'    - fileClass == "Book"',
				"views:",
				"  - type: fileclass-table",
				'    name: "Book"',
				"    order:",
				"      - file.name",
				"      - author",
				"      - rating",
				"",
			].join("\n")
		);
	});

	it("YAML-quotes field names that aren't bare identifiers (bare property name, #37)", () => {
		const yaml = buildBaseYaml("FC", ["due date"], "fileClass");
		// Bare quoted name — Bases normalizes to note.due date; NOT note["due date"]
		// (which Bases would re-prefix to note.note["due date"]).
		expect(yaml).toContain('      - "due date"');
		expect(yaml).not.toContain("note[");
	});

	it("respects a custom alias", () => {
		expect(buildBaseYaml("X", [], "class")).toContain('    - class == "X"');
	});

	it("names the view after the managed view name when given", () => {
		const yaml = buildBaseYaml("Article", ["author"], "fileClass", "fileclass");
		expect(yaml).toContain('    name: "fileclass"'); // managed view name, not "Article"
		expect(yaml).toContain('    - fileClass == "Article"'); // filter still on the class
	});
});

describe("mirrorBaseView", () => {
	it("mirrors the managed view's order exactly (add/remove/reorder)", () => {
		const base = {
			views: [
				{ type: "table", name: "Book", order: ["file.name", "old", "author"] },
				{ type: "table", name: "My view", order: ["file.name", "custom"] },
			],
		};
		const changed = mirrorBaseView(base, "Book", ["author", "rating"]);
		expect(changed).toBe(true);
		// Managed "Book" view = file.name + current fields (old dropped, rating added).
		expect(base.views[0].order).toEqual(["file.name", "author", "rating"]);
		// The user's own view is untouched.
		expect(base.views[1].order).toEqual(["file.name", "custom"]);
	});

	it("reports no change when already mirrored", () => {
		const base = { views: [{ type: "table", name: "Book", order: ["file.name", "author"] }] };
		expect(mirrorBaseView(base, "Book", ["author"])).toBe(false);
	});

	it("creates the managed view (editable type) when missing", () => {
		const base = { views: [{ type: "table", name: "Other", order: ["file.name"] }] };
		expect(mirrorBaseView(base, "Book", ["a"])).toBe(true);
		expect(base.views).toHaveLength(2);
		expect(base.views[1]).toEqual({
			type: "fileclass-table",
			name: "Book",
			order: ["file.name", "a"],
		});
	});

	it("recognizes an editable fileclass-table view (keeps its type)", () => {
		const base = { views: [{ type: "fileclass-table", name: "Book", order: ["file.name"] }] };
		expect(mirrorBaseView(base, "Book", ["a"])).toBe(true);
		expect(base.views[0]).toEqual({ type: "fileclass-table", name: "Book", order: ["file.name", "a"] });
	});

	it("uses bare property names in order (stringifyYaml handles quoting; #37)", () => {
		const base = { views: [{ type: "table", name: "FC", order: [] }] };
		mirrorBaseView(base, "FC", ["due date"]);
		expect(base.views[0].order).toEqual(["file.name", "due date"]);
	});

	it("is idempotent for spaced field names — no perpetual re-sync (#37)", () => {
		const fields = ["due date", "Playing style"];
		const base = { views: [{ type: "table", name: "FC", order: [] }] };
		mirrorBaseView(base, "FC", fields);
		expect(base.views[0].order).toEqual(["file.name", "due date", "Playing style"]);
		// A base already carrying the bare names reports synced and isn't rewritten.
		expect(isBaseViewSynced(base, "FC", fields)).toBe(true);
		expect(mirrorBaseView(base, "FC", fields)).toBe(false);
	});
});

describe("isBaseViewSynced", () => {
	const base = {
		views: [
			{ type: "table", name: "Book", order: ["file.name", "author"] },
			{ type: "table", name: "Custom", order: ["file.name", "x"] },
		],
	};
	it("true when the managed view mirrors the fields", () => {
		expect(isBaseViewSynced(base, "Book", ["author"])).toBe(true);
	});
	it("false when it diverges (different fields or order)", () => {
		expect(isBaseViewSynced(base, "Book", ["author", "rating"])).toBe(false);
		expect(isBaseViewSynced(base, "Book", ["rating"])).toBe(false);
	});
	it("false when the managed view is missing", () => {
		expect(isBaseViewSynced(base, "Nope", ["author"])).toBe(false);
	});
});
