import { describe, expect, it } from "vitest";

import { buildBaseYaml, isBaseViewSynced, mirrorBaseView } from "../../src/views/baseYaml";

describe("buildBaseYaml", () => {
	it("filters at the view level (issue #55) and lists file.name + fields", () => {
		const yaml = buildBaseYaml("Book", ["author", "rating"], "fileClass");
		expect(yaml).toBe(
			[
				"views:",
				"  - type: fileclass-table",
				'    name: "Book"',
				"    filters:",
				"      and:",
				'        - list(fileClass).contains("Book")',
				"    order:",
				"      - file.name",
				"      - author",
				"      - rating",
				"",
			].join("\n")
		);
	});

	it("carries no base-wide filter, so other views aren't shadowed (#55)", () => {
		const yaml = buildBaseYaml("Book", ["author"], "fileClass");
		// The class filter lives under the view, not at the top level.
		expect(yaml).not.toMatch(/^filters:/m);
		expect(yaml.indexOf("    filters:")).toBeGreaterThan(yaml.indexOf("views:"));
	});

	it("YAML-quotes field names that aren't bare identifiers (bare property name, #37)", () => {
		const yaml = buildBaseYaml("FC", ["due date"], "fileClass");
		// Bare quoted name — Bases normalizes to note.due date; NOT note["due date"]
		// (which Bases would re-prefix to note.note["due date"]).
		expect(yaml).toContain('      - "due date"');
		expect(yaml).not.toContain("note[");
	});

	it("respects a custom alias", () => {
		expect(buildBaseYaml("X", [], "class")).toContain('        - list(class).contains("X")');
	});

	it("names the view after the managed view name when given", () => {
		const yaml = buildBaseYaml("Article", ["author"], "fileClass", "fileclass");
		expect(yaml).toContain('    name: "fileclass"'); // managed view name, not "Article"
		expect(yaml).toContain('        - list(fileClass).contains("Article")'); // filter still on the class
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
		const changed = mirrorBaseView(base, "Book", ["author", "rating"], "Book", "fileClass");
		expect(changed).toBe(true);
		// Managed "Book" view = file.name + current fields (old dropped, rating added).
		expect(base.views[0].order).toEqual(["file.name", "author", "rating"]);
		// The user's own view is untouched.
		expect(base.views[1].order).toEqual(["file.name", "custom"]);
	});

	it("never touches an existing managed view's filters (#55 migration-safe)", () => {
		// Legacy shape: base-wide filter, no view-level filter. Sync must not move it.
		const base = {
			filters: { and: ['fileClass == "Book"'] },
			views: [{ type: "table", name: "Book", order: ["file.name", "old"] }],
		} as Record<string, unknown> & { views: Array<Record<string, unknown>> };
		mirrorBaseView(base, "Book", ["author"], "Book", "fileClass");
		// Base-wide filter preserved as-is; the view gains no filter behind the user's back.
		expect(base.filters).toEqual({ and: ['fileClass == "Book"'] });
		expect(base.views[0].filters).toBeUndefined();
	});

	it("reports no change when already mirrored", () => {
		const base = { views: [{ type: "table", name: "Book", order: ["file.name", "author"] }] };
		expect(mirrorBaseView(base, "Book", ["author"], "Book", "fileClass")).toBe(false);
	});

	it("creates the managed view (editable type) with a view-level filter when missing (#55)", () => {
		const base = { views: [{ type: "table", name: "Other", order: ["file.name"] }] };
		expect(mirrorBaseView(base, "Book", ["a"], "Book", "fileClass")).toBe(true);
		expect(base.views).toHaveLength(2);
		expect(base.views[1]).toEqual({
			type: "fileclass-table",
			name: "Book",
			filters: { and: ['list(fileClass).contains("Book")'] },
			order: ["file.name", "a"],
		});
	});

	it("recognizes an editable fileclass-table view (keeps its type)", () => {
		const base = { views: [{ type: "fileclass-table", name: "Book", order: ["file.name"] }] };
		expect(mirrorBaseView(base, "Book", ["a"], "Book", "fileClass")).toBe(true);
		expect(base.views[0]).toEqual({ type: "fileclass-table", name: "Book", order: ["file.name", "a"] });
	});

	it("uses bare property names in order (stringifyYaml handles quoting; #37)", () => {
		const base = { views: [{ type: "table", name: "FC", order: [] }] };
		mirrorBaseView(base, "FC", ["due date"], "FC", "fileClass");
		expect(base.views[0].order).toEqual(["file.name", "due date"]);
	});

	it("is idempotent for spaced field names — no perpetual re-sync (#37)", () => {
		const fields = ["due date", "Playing style"];
		const base = { views: [{ type: "table", name: "FC", order: [] }] };
		mirrorBaseView(base, "FC", fields, "FC", "fileClass");
		expect(base.views[0].order).toEqual(["file.name", "due date", "Playing style"]);
		// A base already carrying the bare names reports synced and isn't rewritten.
		expect(isBaseViewSynced(base, "FC", fields)).toBe(true);
		expect(mirrorBaseView(base, "FC", fields, "FC", "fileClass")).toBe(false);
	});

	it("keeps two fileClasses' views scoped independently across a re-sync (#55)", () => {
		// A base hosting a Book view (managed) and a bookAuthor view (another
		// fileClass). Both filter at the view level; no base-wide filter.
		const base = {
			views: [
				{
					type: "fileclass-table",
					name: "Book",
					filters: { and: ['fileClass == "Book"'] },
					order: ["file.name", "title"],
				},
				{
					type: "fileclass-table",
					name: "bookAuthor",
					filters: { and: ['fileClass == "bookAuthor"'] },
					order: ["file.name", "name"],
				},
			],
		};
		// Sync the Book view with a new field.
		expect(mirrorBaseView(base, "Book", ["title", "rating"], "Book", "fileClass")).toBe(true);
		expect(base.views[0].order).toEqual(["file.name", "title", "rating"]);
		// The Book scope is preserved and the other fileClass's view is untouched.
		expect(base.views[0].filters).toEqual({ and: ['fileClass == "Book"'] });
		expect(base.views[1]).toEqual({
			type: "fileclass-table",
			name: "bookAuthor",
			filters: { and: ['fileClass == "bookAuthor"'] },
			order: ["file.name", "name"],
		});
		// Never pushes a scope back to base-wide.
		expect((base as Record<string, unknown>).filters).toBeUndefined();
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
