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
