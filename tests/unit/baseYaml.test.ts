import { describe, expect, it } from "vitest";

import {
	buildBaseYaml,
	fileClassPredicates,
	fileClassViewFilter,
	isBaseViewSynced,
	isGeneratedScopeFilter,
	keptColumns,
	mirrorBaseView,
	mirrorOrderKeeping,
} from "../../src/views/baseYaml";

/** The common case: a class its notes name in frontmatter, nothing else. */
const byProperty = (name: string, alias = "fileClass") => ({ alias, name });

describe("buildBaseYaml", () => {
	it("filters at the view level (issue #55) and lists file.name + fields", () => {
		const yaml = buildBaseYaml(byProperty("Book"), ["author", "rating"]);
		expect(yaml).toBe(
			[
				"views:",
				"  - type: fileclass-table",
				'    name: "Book"',
				"    filters:",
				"      and:",
				'        - fileClass.containsAny("Book")',
				"    order:",
				"      - file.name",
				"      - author",
				"      - rating",
				"",
			].join("\n")
		);
	});

	it("carries no base-wide filter, so other views aren't shadowed (#55)", () => {
		const yaml = buildBaseYaml(byProperty("Book"), ["author"]);
		// The class filter lives under the view, not at the top level.
		expect(yaml).not.toMatch(/^filters:/m);
		expect(yaml.indexOf("    filters:")).toBeGreaterThan(yaml.indexOf("views:"));
	});

	it("YAML-quotes field names that aren't bare identifiers (bare property name, #37)", () => {
		const yaml = buildBaseYaml(byProperty("FC"), ["due date"]);
		// Bare quoted name — Bases normalizes to note.due date; NOT note["due date"]
		// (which Bases would re-prefix to note.note["due date"]).
		expect(yaml).toContain('      - "due date"');
		expect(yaml).not.toContain("note[");
	});

	it("respects a custom alias", () => {
		expect(buildBaseYaml(byProperty("X", "class"), [])).toContain('        - class.containsAny("X")');
	});

	it("names the view after the managed view name when given", () => {
		const yaml = buildBaseYaml(byProperty("Article"), ["author"], "fileclass");
		expect(yaml).toContain('    name: "fileclass"'); // managed view name, not "Article"
		expect(yaml).toContain('        - fileClass.containsAny("Article")'); // filter still on the class
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
		const changed = mirrorBaseView(base, "Book", ["author", "rating"], byProperty("Book", "fileClass"));
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
		mirrorBaseView(base, "Book", ["author"], byProperty("Book", "fileClass"));
		// Base-wide filter preserved as-is; the view gains no filter behind the user's back.
		expect(base.filters).toEqual({ and: ['fileClass == "Book"'] });
		expect(base.views[0].filters).toBeUndefined();
	});

	it("reports no change when already mirrored", () => {
		const base = { views: [{ type: "table", name: "Book", order: ["file.name", "author"] }] };
		expect(mirrorBaseView(base, "Book", ["author"], byProperty("Book", "fileClass"))).toBe(false);
	});

	it("creates the managed view (editable type) with a view-level filter when missing (#55)", () => {
		const base = { views: [{ type: "table", name: "Other", order: ["file.name"] }] };
		expect(mirrorBaseView(base, "Book", ["a"], byProperty("Book", "fileClass"))).toBe(true);
		expect(base.views).toHaveLength(2);
		expect(base.views[1]).toEqual({
			type: "fileclass-table",
			name: "Book",
			filters: { and: ['fileClass.containsAny("Book")'] },
			order: ["file.name", "a"],
		});
	});

	it("recognizes an editable fileclass-table view (keeps its type)", () => {
		const base = { views: [{ type: "fileclass-table", name: "Book", order: ["file.name"] }] };
		expect(mirrorBaseView(base, "Book", ["a"], byProperty("Book", "fileClass"))).toBe(true);
		expect(base.views[0]).toEqual({ type: "fileclass-table", name: "Book", order: ["file.name", "a"] });
	});

	it("uses bare property names in order (stringifyYaml handles quoting; #37)", () => {
		const base = { views: [{ type: "table", name: "FC", order: [] }] };
		mirrorBaseView(base, "FC", ["due date"], byProperty("FC", "fileClass"));
		expect(base.views[0].order).toEqual(["file.name", "due date"]);
	});

	it("is idempotent for spaced field names — no perpetual re-sync (#37)", () => {
		const fields = ["due date", "Playing style"];
		const base = { views: [{ type: "table", name: "FC", order: [] }] };
		mirrorBaseView(base, "FC", fields, byProperty("FC", "fileClass"));
		expect(base.views[0].order).toEqual(["file.name", "due date", "Playing style"]);
		// A base already carrying the bare names reports synced and isn't rewritten.
		expect(isBaseViewSynced(base, "FC", fields)).toBe(true);
		expect(mirrorBaseView(base, "FC", fields, byProperty("FC", "fileClass"))).toBe(false);
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
		expect(mirrorBaseView(base, "Book", ["title", "rating"], byProperty("Book", "fileClass"))).toBe(true);
		expect(base.views[0].order).toEqual(["file.name", "title", "rating"]);
		// The Book scope is preserved and the other fileClass's view is untouched.
		expect(base.views[0].filters).toEqual({ and: ['fileClass.containsAny("Book")'] });
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

describe("the filter scopes the view to what actually binds a note", () => {
	it("adds a folder predicate, because a folder-bound note has no class property", () => {
		// The bug take 000 filmed: Author is mapped to Authors/, its notes carry no
		// `fileClass`, and the generated view returned nothing at all.
		expect(fileClassPredicates({ alias: "fileClass", name: "Author", folders: ["Authors"] })).toEqual([
			'fileClass.containsAny("Author")',
			'file.inFolder("Authors")',
		]);
	});

	it("uses inFolder, not folder equality, since binding is by prefix", () => {
		// `file.folder == "Authors"` leaves out Authors/Deep/…, which IS bound.
		const [, folder] = fileClassPredicates({ alias: "fileClass", name: "A", folders: ["Authors/"] });
		expect(folder).toBe('file.inFolder("Authors")'); // trailing slash trimmed
	});

	it("adds a tag predicate per binding tag, hash optional", () => {
		expect(fileClassPredicates({ alias: "fileClass", name: "A", tags: ["author", "#writer"] })).toEqual([
			'fileClass.containsAny("A")',
			'file.hasTag("author")',
			'file.hasTag("writer")',
		]);
	});

	it("skips tags that can never bind (whitespace) and empty folders", () => {
		expect(
			fileClassPredicates({ alias: "fileClass", name: "A", tags: ["two words", " "], folders: ["", "  "] })
		).toEqual(['fileClass.containsAny("A")']);
	});

	it("keeps one predicate flat and groups several under or", () => {
		expect(fileClassViewFilter(byProperty("Book"))).toEqual({ and: ['fileClass.containsAny("Book")'] });
		expect(fileClassViewFilter({ alias: "fileClass", name: "Author", folders: ["Authors"] })).toEqual({
			and: [{ or: ['fileClass.containsAny("Author")', 'file.inFolder("Authors")'] }],
		});
	});

	it("writes the or group as YAML Bases parses", () => {
		const yaml = buildBaseYaml({ alias: "fileClass", name: "Author", folders: ["Authors"] }, ["language"]);
		expect(yaml).toContain(
			["    filters:", "      and:", "        - or:", '            - fileClass.containsAny("Author")', '            - file.inFolder("Authors")'].join("\n")
		);
	});
});

describe("repairing a base generated before its class was mapped", () => {
	interface TestView {
		type: string;
		name: string;
		filters: unknown;
		order: string[];
	}
	const legacy = (): { views: TestView[] } => ({
		views: [
			{
				type: "fileclass-table",
				name: "Author",
				filters: { and: ['fileClass == "Author"'] },
				order: ["file.name", "language"],
			},
		],
	});

	it("brings an untouched generated filter up to date", () => {
		const base = legacy();
		const changed = mirrorBaseView(base, "Author", ["language"], {
			alias: "fileClass",
			name: "Author",
			folders: ["Authors"],
		});
		expect(changed).toBe(true);
		expect(base.views[0].filters).toEqual({
			and: [{ or: ['fileClass.containsAny("Author")', 'file.inFolder("Authors")'] }],
		});
	});

	it("leaves a hand-edited filter alone", () => {
		const base = legacy();
		base.views[0].filters = { and: ['fileClass == "Author"', 'language != "German"'] };
		const changed = mirrorBaseView(base, "Author", ["language"], {
			alias: "fileClass",
			name: "Author",
			folders: ["Authors"],
		});
		expect(changed).toBe(false);
		expect(base.views[0].filters).toEqual({ and: ['fileClass == "Author"', 'language != "German"'] });
	});

	it("changes nothing when the filter is already right", () => {
		const base = legacy();
		base.views[0].filters = {
			and: [{ or: ['fileClass.containsAny("Author")', 'file.inFolder("Authors")'] }],
		};
		expect(
			mirrorBaseView(base, "Author", ["language"], {
				alias: "fileClass",
				name: "Author",
				folders: ["Authors"],
			})
		).toBe(false);
	});

	it("recognizes its own filters and nothing else", () => {
		const scope = { alias: "fileClass", name: "A", folders: ["F"] };
		expect(isGeneratedScopeFilter({ and: ['fileClass.containsAny("A")'] }, scope)).toBe(true);
		// A base generated before the clause changed is still ours, so a sync repairs it.
		expect(isGeneratedScopeFilter({ and: ['fileClass == "A"'] }, scope)).toBe(true);
		expect(
			isGeneratedScopeFilter({ and: [{ or: ['fileClass == "A"', 'file.inFolder("x")'] }] }, scope)
		).toBe(true);
		expect(isGeneratedScopeFilter({ and: [{ or: ['fileClass == "A"', 'file.hasTag("a")'] }] }, scope)).toBe(true);
		expect(isGeneratedScopeFilter({ and: [{ or: ['fileClass == "A"', 'rating > 3'] }] }, scope)).toBe(false);
		expect(isGeneratedScopeFilter({ and: ['fileClass == "Other"'] }, scope)).toBe(false);
		expect(isGeneratedScopeFilter({ or: ['fileClass == "A"'] }, scope)).toBe(false);
	});
});

describe("sync status notices a scope that moved", () => {
	const base = (filters: unknown) => ({
		views: [{ type: "fileclass-table", name: "Author", filters, order: ["file.name", "language"] }],
	});
	const mapped = { alias: "fileClass", name: "Author", folders: ["Authors"] };

	it("reports out of sync when the class gained a folder after the base was made", () => {
		// The columns still match — mapping a class to a folder changes no field — so
		// comparing `order` alone said "synced" over a view returning nothing, and the
		// Sync button stayed disabled.
		const b = base({ and: ['fileClass == "Author"'] });
		expect(isBaseViewSynced(b, "Author", ["language"])).toBe(true); // fields only
		expect(isBaseViewSynced(b, "Author", ["language"], mapped)).toBe(false);
	});

	it("reports synced once the filter carries the folder", () => {
		const b = base({
			and: [{ or: ['fileClass.containsAny("Author")', 'file.inFolder("Authors")'] }],
		});
		expect(isBaseViewSynced(b, "Author", ["language"], mapped)).toBe(true);
	});

	it("reports out of sync while the filter still tests the class with ==", () => {
		// `fileClass == "Author"` misses a note carrying several classes, since the property is
		// then a list. A base written before the clause changed is ours, so it is repairable —
		// which means it must read as out of sync until a sync rewrites it.
		const b = base({ and: [{ or: ['fileClass == "Author"', 'file.inFolder("Authors")'] }] });
		expect(isBaseViewSynced(b, "Author", ["language"], mapped)).toBe(false);
	});

	it("never calls a hand-edited filter out of sync", () => {
		const b = base({ and: ['fileClass == "Author"', 'language != "German"'] });
		expect(isBaseViewSynced(b, "Author", ["language"], mapped)).toBe(true);
	});
});

describe("columns a sync must not delete", () => {
	it("keeps a formula column", () => {
		// Reported: a sync rebuilt the order from the fields alone and dropped it every time.
		expect(keptColumns(["file.name", "author", "formula.Editions"], ["author"])).toEqual([
			"formula.Editions",
		]);
	});

	it("keeps a file column other than the name", () => {
		expect(keptColumns(["file.name", "file.mtime", "author"], ["author"])).toEqual(["file.mtime"]);
	});

	it("drops a bare column no field declares, on purpose", () => {
		// It is indistinguishable from the ghost of a field the class removed, and resurrecting those
		// forever is worse than dropping one somebody added by hand. This is what makes removing a
		// field from a class actually remove its column.
		expect(keptColumns(["file.name", "author", "old"], ["author"])).toEqual([]);
	});

	it("puts ours first and the reader's after, so the next sync moves nothing", () => {
		const once = mirrorOrderKeeping(["author", "pages"], ["file.name", "formula.X", "author"]);
		expect(once).toEqual(["file.name", "author", "pages", "formula.X"]);
		expect(mirrorOrderKeeping(["author", "pages"], once)).toEqual(once);
	});

	it("survives an order holding things that are not strings", () => {
		expect(keptColumns(["file.name", null, 3, { a: 1 }, "formula.Y"], [])).toEqual(["formula.Y"]);
	});
});
