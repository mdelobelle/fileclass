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

	it("falls back to the global fileClass", () => {
		const r = resolveBinding(emptyBinding, makeRegistry({ globalFileClass: "Global" }));
		expect(r.source).toBe("global");
		expect(r.fields.map((f) => f.id)).toEqual(["g1"]);
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
