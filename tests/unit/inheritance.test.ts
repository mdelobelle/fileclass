import { describe, expect, it } from "vitest";

import { Field } from "../../src/schema/field";
import { computeAncestors, resolveInheritedFields } from "../../src/schema/inheritance";

const field = (name: string, id: string, fileClassName: string): Field => ({
	id,
	name,
	type: "Input",
	options: [],
	path: "",
	fileClassName,
});

describe("computeAncestors", () => {
	const chain: Record<string, string> = { A: "B", B: "C" };
	const parentOf = (n: string) => chain[n];

	it("follows the extends chain nearest-first", () => {
		expect(computeAncestors("A", parentOf)).toEqual(["B", "C"]);
		expect(computeAncestors("C", parentOf)).toEqual([]);
	});

	it("guards against cycles and self-references", () => {
		expect(computeAncestors("X", (n) => (n === "X" ? "Y" : "X"))).toEqual(["Y"]);
		expect(computeAncestors("S", () => "S")).toEqual([]);
	});

	it("stops at a missing parent", () => {
		expect(computeAncestors("A", (n) => (n === "A" ? "Ghost" : undefined))).toEqual(["Ghost"]);
	});
});

describe("resolveInheritedFields", () => {
	const own: Record<string, Field[]> = {
		Child: [field("title", "c1", "Child"), field("rating", "c2", "Child")],
		Parent: [field("title", "p1", "Parent"), field("author", "p2", "Parent")],
		Grand: [field("isbn", "g1", "Grand")],
	};
	const ownFieldsOf = (n: string) => own[n] ?? [];

	it("merges self + ancestors, nearest declaration of a name wins", () => {
		const fields = resolveInheritedFields("Child", ["Parent", "Grand"], ownFieldsOf, () => []);
		expect(fields.map((f) => `${f.name}:${f.id}`)).toEqual([
			"title:c1", // Child's title shadows Parent's
			"rating:c2",
			"author:p2",
			"isbn:g1",
		]);
	});

	it("applies excludes, accumulating down the chain", () => {
		// Parent excludes "isbn" → removed from the deeper Grand ancestor.
		const excludesOf = (n: string) => (n === "Parent" ? ["isbn"] : []);
		const fields = resolveInheritedFields("Child", ["Parent", "Grand"], ownFieldsOf, excludesOf);
		expect(fields.map((f) => f.name)).toEqual(["title", "rating", "author"]);
	});

	it("lets a class exclude a name from itself too", () => {
		const excludesOf = (n: string) => (n === "Child" ? ["rating"] : []);
		const fields = resolveInheritedFields("Child", [], ownFieldsOf, excludesOf);
		expect(fields.map((f) => f.name)).toEqual(["title"]);
	});
});

describe("resolveInheritedFields — a name at two levels", () => {
	// A class's `fields[]` holds its nested children flat, told apart by `path`. A book
	// with a `publisher` and editions that each have their own publisher is the natural
	// way to model this, and de-duplicating on the name alone dropped the child — so
	// nothing offered it when adding an item to the list.
	const nested = (name: string, id: string, path: string): Field => ({
		id,
		name,
		type: "Input",
		options: [],
		path,
		fileClassName: "Book",
	});
	const own: Record<string, Field[]> = {
		Book: [
			field("publisher", "b1", "Book"),
			field("editions", "eDitns", "Book"),
			nested("year", "e1", "eDitns"),
			nested("publisher", "e2", "eDitns"),
		],
	};
	const ownFieldsOf = (n: string) => own[n] ?? [];

	it("keeps a child that shares a root field's name", () => {
		const fields = resolveInheritedFields("Book", [], ownFieldsOf, () => []);
		expect(fields.map((f) => `${f.name}@${f.path || "root"}`)).toEqual([
			"publisher@root",
			"editions@root",
			"year@eDitns",
			"publisher@eDitns",
		]);
	});

	it("still lets a subclass override an inherited child, at its own level", () => {
		const parent = { Base: own.Book };
		const child: Field[] = [nested("publisher", "own", "eDitns")];
		const fields = resolveInheritedFields(
			"Book",
			["Base"],
			(n) => (n === "Book" ? child : parent.Base),
			() => []
		);
		const publishers = fields.filter((f) => f.name === "publisher");
		// One per level, and the nested one is the subclass's own declaration.
		expect(publishers.map((f) => `${f.path || "root"}:${f.id}`)).toEqual([
			"eDitns:own",
			"root:b1",
		]);
	});

	it("excludes a root field without taking a same-named child with it", () => {
		// `excludes` names a field of a class, which is a root field; a group's children
		// go with their parent, not with a word.
		const fields = resolveInheritedFields("Book", [], ownFieldsOf, () => ["publisher"]);
		expect(fields.map((f) => `${f.name}@${f.path || "root"}`)).toEqual([
			"editions@root",
			"year@eDitns",
			"publisher@eDitns",
		]);
	});
});
