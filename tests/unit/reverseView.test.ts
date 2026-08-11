import { describe, expect, it } from "vitest";

import {
	addReverseView,
	appendEmbed,
	findEmbedLine,
	linkCardinality,
	reverseClause,
	reverseEmbed,
	reverseOrder,
	reverseViewFilter,
	reverseViewName,
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
