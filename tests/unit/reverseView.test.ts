import { describe, expect, it } from "vitest";

import {
	addReverseView,
	appendEmbed,
	fieldForView,
	filtersReadFieldBackwards,
	findEmbedLine,
	formatViewRef,
	parseViewRef,
	relatedViewsFor,
	withRelatedView,
	linkCardinality,
	reverseClause,
	reverseEmbed,
	reverseOrder,
	reverseViewFilter,
	reverseViewName,
	withReverseClause,
	viewOrder,
} from "../../src/views/reverseView";
import { ClassScope } from "../../src/views/baseYaml";

const scope = (over: Partial<ClassScope> = {}): ClassScope => ({
	alias: "fileClass",
	name: "Book",
	...over,
});

describe("which fields can be read backwards", () => {
	it("knows the link types, and their cardinality", () => {
		expect(linkCardinality("File")).toBe("single");
		expect(linkCardinality("Media")).toBe("single");
		expect(linkCardinality("MultiFile")).toBe("multiple");
		expect(linkCardinality("MultiMedia")).toBe("multiple");
	});

	it("refuses a type that holds no link", () => {
		// A Select storing an author's name looks like a relation and is not one: nothing resolves
		// it to a file, so no filter over it can survive a rename or tell namesakes apart.
		expect(linkCardinality("Select")).toBeNull();
		expect(linkCardinality("Input")).toBeNull();
		expect(linkCardinality("Formula")).toBeNull();
	});
});

describe("the clause that reads the relation backwards", () => {
	it("compares links, not names", () => {
		expect(reverseClause("author", "single")).toBe("author == this.file.asLink()");
	});

	it("uses containment for a list, since equality matches nothing on one", () => {
		expect(reverseClause("contributors", "multiple")).toBe(
			"contributors.contains(this.file.asLink())"
		);
	});

	it("never falls back to the basename", () => {
		// Measured trap: `author.contains(this.file.name)` also matched a note pointing at a
		// different file of the same name, in another folder. Two rows where one was right.
		for (const cardinality of ["single", "multiple"] as const) {
			expect(reverseClause("author", cardinality)).not.toContain("this.file.name");
		}
	});

	it("brackets a field name a bare reference cannot carry", () => {
		expect(reverseClause("written by", "single")).toBe('note["written by"] == this.file.asLink()');
		expect(reverseClause("a.b", "multiple")).toBe('note["a.b"].contains(this.file.asLink())');
	});
});

describe("the view's identity", () => {
	it("names the class and the field, and no host", () => {
		expect(reverseViewName("Book", "author")).toBe("Book by author");
	});

	it("embeds by base path and view name", () => {
		expect(reverseEmbed("Bases/Books.base", "Book by author")).toBe(
			"![[Bases/Books.base#Book by author]]"
		);
	});
});

describe("the filter keeps the class's whole scope", () => {
	it("is the class clause and the reverse clause", () => {
		expect(reverseViewFilter(scope(), "author", "single")).toEqual({
			and: ['fileClass.containsAny("Book")', "author == this.file.asLink()"],
		});
	});

	it("keeps folder- and tag-bound notes in scope", () => {
		// A class claimed by a folder has notes with no `fileClass` property at all; filtering on
		// the property alone would drop exactly those, which the generator learned the hard way.
		const filter = reverseViewFilter(
			scope({ folders: ["Reading list"], tags: ["novel"] }),
			"author",
			"single"
		);
		expect(filter.and).toHaveLength(2);
		expect(filter.and[0]).toEqual({
			or: [
				'fileClass.containsAny("Book")',
				'file.inFolder("Reading list")',
				'file.hasTag("novel")',
			],
		});
		expect(filter.and[1]).toBe("author == this.file.asLink()");
	});
});

describe("the columns", () => {
	it("drops the pointing field, which holds the host on every row", () => {
		expect(reverseOrder(["file.name", "author", "pages", "read"], "author")).toEqual([
			"file.name",
			"pages",
			"read",
		]);
	});

	it("drops it under either notation, since a hand-edited order may carry either", () => {
		expect(reverseOrder(["file.name", "note.author", "pages"], "author")).toEqual([
			"file.name",
			"pages",
		]);
	});

	it("keeps the rest as given, formulas included", () => {
		expect(reverseOrder(["file.name", "formula.Editions", "pages"], "author")).toEqual([
			"file.name",
			"formula.Editions",
			"pages",
		]);
	});

	it("puts the name first even when the given order did not", () => {
		expect(reverseOrder(["pages", "file.name"], "author")).toEqual(["file.name", "pages"]);
	});

	it("takes the shape of the class's own table when the base holds one", () => {
		// A Book table someone trimmed to two columns should not come back as a reverse table of
		// twenty: the reader already said what these notes are worth showing.
		const base = { views: [{ name: "Book", order: ["file.name", "author", "published"] }] };
		expect(viewOrder(base, "Book")).toEqual(["file.name", "author", "published"]);
		expect(reverseOrder(viewOrder(base, "Book") ?? [], "author")).toEqual([
			"file.name",
			"published",
		]);
	});

	it("has no shape to take from a base without that view", () => {
		expect(viewOrder({ views: [{ name: "Other" }] }, "Book")).toBeNull();
		expect(viewOrder({}, "Book")).toBeNull();
		expect(viewOrder({ views: [{ name: "Book" }] }, "Book")).toBeNull();
	});
});

describe("adding the view to a base", () => {
	it("adds an editable table with the fields in order", () => {
		const base: { views?: unknown } = { views: [{ type: "table", name: "All books" }] };
		expect(addReverseView(base, "Book by author", { and: ["x"] }, ["file.name", "author"])).toBe(
			"added"
		);
		const views = base.views as { type: string; name: string; order: string[] }[];
		expect(views).toHaveLength(2);
		expect(views[1]).toMatchObject({
			type: "fileclass-table",
			name: "Book by author",
			order: ["file.name", "author"],
		});
	});

	it("reuses the view when it is already there, whatever became of it", () => {
		// One view serves every host, so the second author to ask must find the first one's view —
		// and find it as the reader left it, columns, sort and filter included.
		const view = { type: "table", name: "Book by author", filters: { and: ["hand-written"] } };
		const base = { views: [view] };
		expect(addReverseView(base, "Book by author", { and: ["generated"] }, ["file.name"])).toBe(
			"reused"
		);
		expect(base.views).toHaveLength(1);
		expect(base.views[0]).toBe(view);
		expect(view.filters).toEqual({ and: ["hand-written"] });
	});

	it("copes with a base that has no views yet", () => {
		const base: { views?: unknown } = {};
		expect(addReverseView(base, "Book by author", { and: ["x"] }, [])).toBe("added");
		expect((base.views as unknown[]).length).toBe(1);
	});
});

describe("the embed in the host note", () => {
	it("finds one that is already there", () => {
		const body = "# Melville\n\n![[Bases/Books.base#Book by author]]\n";
		expect(findEmbedLine(body, "Bases/Books.base", "Book by author")).toBe(2);
	});

	it("recognises one someone reformatted or aliased", () => {
		const body = "> ![[Bases/Books.base#Book by author|his books]]\n";
		expect(findEmbedLine(body, "Bases/Books.base", "Book by author")).toBe(0);
	});

	it("does not mistake another view of the same base for it", () => {
		const body = "![[Bases/Books.base#All books]]\n";
		expect(findEmbedLine(body, "Bases/Books.base", "Book by author")).toBe(-1);
	});

	it("appends after the body, leaving a blank line", () => {
		const { body, line } = appendEmbed("# Melville\n\nSome prose.\n", "![[x#y]]");
		expect(body).toBe("# Melville\n\nSome prose.\n\n![[x#y]]\n");
		expect(body.split("\n")[line]).toBe("![[x#y]]");
	});

	it("writes at the top of an empty note", () => {
		const { body, line } = appendEmbed("", "![[x#y]]");
		expect(body).toBe("![[x#y]]\n");
		expect(line).toBe(0);
	});
});

describe("a view a class declares for one of its fields", () => {
	const entries = [
		{ field: "author", view: "Books.base#A's Bs" },
		{ field: "editor", view: "Books.base#Foo" },
	];

	it("splits a reference the way an embed writes it", () => {
		expect(parseViewRef("Books.base#Book by author")).toEqual({
			path: "Books.base",
			viewName: "Book by author",
		});
		expect(formatViewRef("Books.base", "A's Bs")).toBe("Books.base#A's Bs");
	});

	it("keeps a view name containing a hash", () => {
		// Only the first `#` separates; the rest belongs to the name its author chose.
		expect(parseViewRef("B.base#Notes #2")).toEqual({ path: "B.base", viewName: "Notes #2" });
	});

	it("refuses a reference that names no view", () => {
		// "the first view" would be a decision about which relation they meant.
		expect(parseViewRef("Books.base")).toBeNull();
		expect(parseViewRef("#Orphan")).toBeNull();
		expect(parseViewRef("Books.base#")).toBeNull();
	});

	it("finds the views for a field", () => {
		expect(relatedViewsFor(entries, "author")).toEqual([{ path: "Books.base", viewName: "A's Bs" }]);
		expect(relatedViewsFor(entries, "cover")).toEqual([]);
	});

	it("finds every view of a field, not just the first", () => {
		// One relation, shown two ways: `Task.delegate` read backwards as what is ongoing and as
		// what is done. Both are that field read backwards, and both must be found.
		const two = [
			{ field: "delegate", view: "Tasks.base#Delegate's ongoing tasks" },
			{ field: "delegate", view: "Tasks.base#Delegate's done tasks" },
		];
		expect(relatedViewsFor(two, "delegate").map((v) => v.viewName)).toEqual([
			"Delegate's ongoing tasks",
			"Delegate's done tasks",
		]);
	});

	it("skips a declaration that names no view", () => {
		expect(relatedViewsFor([{ field: "author", view: "Books.base" }], "author")).toEqual([]);
	});

	it("finds the field a view reads backwards, whatever it is called", () => {
		// This is what makes a table named `A's Bs` seed exactly like one named by convention.
		expect(fieldForView(entries, "Books.base", "A's Bs")).toBe("author");
		expect(fieldForView(entries, "Books.base", "Foo")).toBe("editor");
	});

	it("says nothing about a view nobody declared", () => {
		expect(fieldForView(entries, "Books.base", "All books")).toBeUndefined();
		expect(fieldForView(entries, "Other.base", "A's Bs")).toBeUndefined();
	});

	it("lets two fields point at the same class through different views", () => {
		// The reason the declaration is keyed on the field: `author` and `editor` both reach Author,
		// and a key on the parent class would have collapsed them into one.
		expect(relatedViewsFor(entries, "author")[0]?.viewName).toBe("A's Bs");
		expect(relatedViewsFor(entries, "editor")[0]?.viewName).toBe("Foo");
	});
});

describe("does a view already read the field backwards", () => {
	it("recognises the four expressions that work, not one exact string", () => {
		// All four were measured matching an aliased link and telling namesakes apart (§3.1); a view
		// written years ago uses whichever its author knew, and "correcting" it would be wrong.
		for (const clause of [
			'author == this.file.asLink()',
			"author.asFile() == this.file",
			"author.linksTo(this.file)",
			"author.contains(this.file.asLink())",
		]) {
			expect(filtersReadFieldBackwards({ and: [clause] }, "author")).toBe(true);
		}
	});

	it("looks inside nested groups", () => {
		const filters = { and: ['fileClass.containsAny("Book")', { or: ["x", "author.linksTo(this.file)"] }] };
		expect(filtersReadFieldBackwards(filters, "author")).toBe(true);
	});

	it("is not fooled by another field's clause", () => {
		expect(filtersReadFieldBackwards({ and: ["editor == this.file.asLink()"] }, "author")).toBe(false);
	});

	it("says no when nothing mentions the note being read from", () => {
		expect(filtersReadFieldBackwards({ and: ['fileClass.containsAny("Book")'] }, "author")).toBe(false);
		expect(filtersReadFieldBackwards(undefined, "author")).toBe(false);
	});
});

describe("adding the clause to a filter somebody else wrote", () => {
	it("appends to the existing and, keeping every other clause", () => {
		const filters = { and: ['fileClass.containsAny("Book")'] };
		expect(withReverseClause(filters, "author == this.file.asLink()")).toEqual({
			and: ['fileClass.containsAny("Book")', "author == this.file.asLink()"],
		});
	});

	it("keeps a sibling key the view had", () => {
		const filters = { and: ["x"], not: ["y"] };
		expect(withReverseClause(filters, "c")).toEqual({ and: ["x", "c"], not: ["y"] });
	});

	it("wraps the short form rather than reinterpreting it", () => {
		// `filters: "expr"` is a selection; the result must be that selection *and* the relation.
		expect(withReverseClause("published > 2000", "c")).toEqual({ and: ["published > 2000", "c"] });
	});

	it("keeps an or-group whole by nesting it, not flattening it", () => {
		const filters = { or: ["a", "b"] };
		expect(withReverseClause(filters, "c")).toEqual({ and: [{ or: ["a", "b"] }, "c"] });
	});

	it("starts one when there is no filter at all", () => {
		expect(withReverseClause(undefined, "c")).toEqual({ and: ["c"] });
	});
});

describe("withRelatedView", () => {
	const entry = (field: string, view: string) => ({ field, view });

	it("adds a second view for a field instead of replacing the first", () => {
		const before = [entry("delegate", "Tasks.base#Ongoing")];
		expect(withRelatedView(before, "delegate", "Tasks.base#Done")).toEqual([
			entry("delegate", "Tasks.base#Ongoing"),
			entry("delegate", "Tasks.base#Done"),
		]);
	});

	it("declares a pair once", () => {
		const before = [entry("delegate", "Tasks.base#Ongoing")];
		expect(withRelatedView(before, "delegate", "Tasks.base#Ongoing")).toEqual(before);
	});

	it("leaves other fields alone", () => {
		const before = [entry("author", "Books.base#A's Bs")];
		expect(withRelatedView(before, "editor", "Books.base#Edited")).toEqual([
			entry("author", "Books.base#A's Bs"),
			entry("editor", "Books.base#Edited"),
		]);
	});

	it("does not mutate what it was given", () => {
		const before = [entry("author", "Books.base#A's Bs")];
		withRelatedView(before, "editor", "Books.base#Edited");
		expect(before).toHaveLength(1);
	});
});
