import { describe, expect, it } from "vitest";

import { Field } from "../../src/schema/field";
import {
	FileBinding,
	FileClassRegistry,
	resolveBinding,
	tagAncestry,
} from "../../src/schema/resolver";

const field = (id: string, fileClassName: string): Field => ({
	id,
	name: id,
	type: "Input",
	options: [],
	path: "",
	fileClassName,
});

const fields: Record<string, Field[]> = {
	Book: [field("b1", "Book"), field("shared", "Book")],
	Todo: [field("t1", "Todo"), field("shared", "Todo")],
	Project: [field("p1", "Project")],
	Global: [field("g1", "Global")],
};

function makeRegistry(over: Partial<FileClassRegistry> = {}): FileClassRegistry {
	return {
		has: (n) => n in fields || n === "Global",
		fieldsOf: (n) => fields[n] ?? [],
		tagBindings: new Map([["book", "Book"]]),
		pathBindings: new Map([["Projects", "Project"]]),
		bookmarkBindings: new Map([["Reading", "Book"]]),
		...over,
	};
}

const emptyBinding: FileBinding = { innerNames: [], tags: [], folderPath: "" };

describe("resolveBinding priority", () => {
	it("uses the frontmatter alias first", () => {
		const r = resolveBinding({ ...emptyBinding, innerNames: ["Book"] }, makeRegistry());
		expect(r.source).toBe("fileClass");
		expect(r.fileClassNames).toEqual(["Book"]);
		expect(r.fields.map((f) => f.id)).toEqual(["b1", "shared"]);
	});

	it("orders inner > tag > path and de-dupes fields by id", () => {
		const binding: FileBinding = {
			innerNames: ["Book"],
			tags: ["book"], // also → Book, already present
			folderPath: "Projects/2026",
		};
		const r = resolveBinding(binding, makeRegistry());
		expect(r.fileClassNames).toEqual(["Book", "Project"]);
		// "shared" from Book is not repeated; Project adds p1.
		expect(r.fields.map((f) => f.id)).toEqual(["b1", "shared", "p1"]);
	});

	it("matches a folder path by prefix", () => {
		const r = resolveBinding({ ...emptyBinding, folderPath: "Projects/sub" }, makeRegistry());
		expect(r.fileClassNames).toEqual(["Project"]);
	});

	it("ignores inner names absent from the registry", () => {
		const r = resolveBinding({ ...emptyBinding, innerNames: ["Ghost"] }, makeRegistry());
		expect(r.source).toBe("none");
	});

	it("lets the last bound class win a key both declare", () => {
		// `fileClass: [Book, Todo]` reads as "a Book, and a Todo on top", and the note has
		// exactly one `shared` key to write to. Both used to survive — they were told apart
		// by id — so the note showed the same name twice, read through two types.
		const r = resolveBinding({ ...emptyBinding, innerNames: ["Book", "Todo"] }, makeRegistry());
		expect(r.fields.map((f) => f.name)).toEqual(["b1", "t1", "shared"]);
		expect(r.fields.find((f) => f.name === "shared")?.fileClassName).toBe("Todo");
	});

	it("and the winner sits where its own class does, not where the loser sat", () => {
		const r = resolveBinding({ ...emptyBinding, innerNames: ["Todo", "Book"] }, makeRegistry());
		// Reversed: Book now has the last word, and `shared` moves into Book's block.
		expect(r.fields.map((f) => f.name)).toEqual(["t1", "b1", "shared"]);
		expect(r.fields.find((f) => f.name === "shared")?.fileClassName).toBe("Book");
	});

	it("a group's child never collides with a root field of the same name", () => {
		// `editions.publisher` and a plain `publisher` are two fields, told apart by level —
		// the same rule inheritance follows.
		const child: Field = { ...field("publisher", "Book"), id: "c1", path: "edId" };
		const root: Field = { ...field("publisher", "Article"), id: "r1" };
		const registry = makeRegistry({
			has: (n) => n === "Book" || n === "Article",
			fieldsOf: (n) => (n === "Book" ? [child] : [root]),
		});
		const r = resolveBinding({ ...emptyBinding, innerNames: ["Book", "Article"] }, registry);
		expect(r.fields.map((f) => f.id)).toEqual(["c1", "r1"]);
	});

	it("binds a note held by a mapped bookmark group", () => {
		// The resolver has accepted `bookmarkGroups` since the first phase; until 0.2.8 the
		// index never filled it, so a class bound to a bookmark group claimed nothing at all.
		const r = resolveBinding({ ...emptyBinding, bookmarkGroups: ["Reading"] }, makeRegistry());
		expect(r.fileClassNames).toEqual(["Book"]);
	});

	it("prefers the frontmatter alias over a bookmark group, and keeps both", () => {
		const r = resolveBinding(
			{ ...emptyBinding, innerNames: ["Todo"], bookmarkGroups: ["Reading"] },
			makeRegistry()
		);
		expect(r.fileClassNames).toEqual(["Todo", "Book"]);
	});

	it("gives an unbound note the global fileClass", () => {
		const r = resolveBinding(emptyBinding, makeRegistry({ globalFileClass: "Global" }));
		expect(r.source).toBe("global");
		expect(r.fields.map((f) => f.id)).toEqual(["g1"]);
	});

	it("gives a typed note the global fileClass too, as a baseline", () => {
		// A vault-wide template is only useful if it reaches the notes that already have a
		// class: as a fallback it reached exactly the notes nobody had typed.
		const r = resolveBinding(
			{ ...emptyBinding, innerNames: ["Book"] },
			makeRegistry({ globalFileClass: "Global" })
		);
		expect(r.fileClassNames).toEqual(["Global", "Book"]);
		expect(r.fields.map((f) => f.id)).toEqual(["g1", "b1", "shared"]);
		// It still says `fileClass`: the note names a class of its own.
		expect(r.source).toBe("fileClass");
	});

	it("lets a note's own class override the baseline on a shared key", () => {
		const globalShared = { ...field("shared", "Global"), id: "g2" };
		const r = resolveBinding(
			{ ...emptyBinding, innerNames: ["Book"] },
			makeRegistry({
				has: (n) => n === "Book" || n === "Global",
				fieldsOf: (n) => (n === "Global" ? [field("g1", "Global"), globalShared] : fields.Book),
				globalFileClass: "Global",
			})
		);
		expect(r.fields.find((f) => f.name === "shared")?.fileClassName).toBe("Book");
		expect(r.fields.map((f) => f.name)).toEqual(["g1", "b1", "shared"]);
	});

	it("never lists the global fileClass twice", () => {
		const r = resolveBinding(
			{ ...emptyBinding, innerNames: ["Global"] },
			makeRegistry({ globalFileClass: "Global" })
		);
		expect(r.fileClassNames).toEqual(["Global"]);
	});

	it("falls back to preset fields, then to none", () => {
		const preset = [field("x", "preset")];
		expect(resolveBinding(emptyBinding, makeRegistry({ presetFields: preset })).source).toBe(
			"preset"
		);
		expect(resolveBinding(emptyBinding, makeRegistry()).source).toBe("none");
	});
});

describe("a nested tag binds to the class its parent tag maps", () => {
	it("lists a tag and the tags it nests under, most specific first", () => {
		expect(tagAncestry("author/french/poetry")).toEqual([
			"author/french/poetry",
			"author/french",
			"author",
		]);
		expect(tagAncestry("book")).toEqual(["book"]);
		expect(tagAncestry("")).toEqual([]);
	});

	it("ignores the case of a tag, as Obsidian does everywhere else", () => {
		// Measured in the app: the file keeps `tags: [Album]` as written, but the vault's own
		// registry reports `#album` — folded. Matching exactly meant a class mapped on `Album`
		// claimed `#Album` and missed `#album`, while the picker could only offer the latter.
		const registry = makeRegistry({ tagBindings: new Map([["album", "Book"]]) });
		for (const tag of ["Album", "ALBUM", "album"]) {
			expect(resolveBinding({ ...emptyBinding, tags: [tag] }, registry).fileClassNames).toEqual([
				"Book",
			]);
		}
	});

	it("and the case of a nested tag's parent too", () => {
		const registry = makeRegistry({ tagBindings: new Map([["album", "Book"]]) });
		const r = resolveBinding({ ...emptyBinding, tags: ["Album/Live"] }, registry);
		expect(r.fileClassNames).toEqual(["Book"]);
	});

	it("binds #book/fiction to the class mapped on book", () => {
		// Obsidian's tag search and Bases' file.hasTag() both include children, so a
		// generated view showed such notes while the resolver left them untyped.
		const r = resolveBinding({ ...emptyBinding, tags: ["book/fiction"] }, makeRegistry());
		expect(r.fileClassNames).toEqual(["Book"]);
		expect(r.source).toBe("fileClass");
	});

	it("prefers the most specific mapping when both levels are mapped", () => {
		const registry = makeRegistry({
			tagBindings: new Map([
				["book", "Book"],
				["book/todo", "Todo"],
			]),
		});
		const r = resolveBinding({ ...emptyBinding, tags: ["book/todo"] }, registry);
		expect(r.fileClassNames).toEqual(["Todo", "Book"]); // specific first, parent still applies
	});

	it("does not bind a sibling branch", () => {
		const r = resolveBinding({ ...emptyBinding, tags: ["notebook/fiction"] }, makeRegistry());
		expect(r.fileClassNames).toEqual([]);
	});
});
