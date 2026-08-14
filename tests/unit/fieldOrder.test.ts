import { describe, expect, it } from "vitest";

import { Field } from "../../src/schema/field";
import {
	applyFieldOrder,
	fieldOrderKey,
	fieldOrderKeys,
	isInherited,
	movedFieldOrder,
	renamedFieldOrder,
} from "../../src/schema/fieldOrder";

const field = (name: string, id: string, fileClassName: string, path = ""): Field => ({
	id,
	name,
	type: "Input",
	options: [],
	path,
	fileClassName,
});

/** `Media` declares title/year, `Book` adds author — the default order the chain produces. */
const inherited = [
	field("title", "m1", "Media"),
	field("year", "m2", "Media"),
	field("author", "b1", "Book"),
];

describe("fieldOrderKey", () => {
	it("names a root field by its name", () => {
		expect(fieldOrderKey(inherited, inherited[0])).toBe("title");
	});

	it("names a child behind the groups holding it", () => {
		const fields = [
			field("editions", "eD", "Book"),
			field("year", "e1", "Book", "eD"),
			field("printing", "e2", "Book", "eD____e1"),
		];
		expect(fieldOrderKey(fields, fields[1])).toBe("editions.year");
		expect(fieldOrderKey(fields, fields[2])).toBe("editions.year.printing");
	});
});

describe("applyFieldOrder", () => {
	it("keeps the inherited default when the class declares no order", () => {
		expect(applyFieldOrder(inherited, []).map((f) => f.name)).toEqual(["title", "year", "author"]);
	});

	it("lets a class mix what it inherits with what it declares", () => {
		// The point of the whole module: `author` between two of Media's fields.
		const order = ["title", "author", "year"];
		expect(applyFieldOrder(inherited, order).map((f) => f.name)).toEqual(["title", "author", "year"]);
	});

	it("ignores a key naming a field that no longer resolves", () => {
		const order = ["isbn", "author", "title", "year"];
		expect(applyFieldOrder(inherited, order).map((f) => f.name)).toEqual(["author", "title", "year"]);
	});

	it("places a field the order does not name after the one it follows by default", () => {
		// `year` is new on Media, and Book's stored order predates it: it belongs behind `title`,
		// where Media put it — not at the end, below Book's own fields.
		const order = ["title", "author"];
		expect(applyFieldOrder(inherited, order).map((f) => f.name)).toEqual(["title", "year", "author"]);
	});

	it("keeps an unnamed field at the head of its level when nothing named precedes it", () => {
		const order = ["year", "author"];
		expect(applyFieldOrder(inherited, order).map((f) => f.name)).toEqual(["title", "year", "author"]);
	});

	it("keeps several consecutive unnamed fields in their own default order", () => {
		const fields = [...inherited, field("isbn", "b2", "Book"), field("rating", "b3", "Book")];
		const order = ["author", "title"];
		expect(applyFieldOrder(fields, order).map((f) => f.name)).toEqual([
			"author",
			"isbn", // Book's own, which follow `author` by default — so they follow it here
			"rating",
			"title",
			"year", // Media's, which follows `title` by default
		]);
	});

	it("orders each level on its own, and keeps children behind their group", () => {
		const fields = [
			field("title", "m1", "Media"),
			field("editions", "eD", "Book"),
			field("year", "e1", "Book", "eD"),
			field("format", "e2", "Book", "eD"),
			field("author", "b1", "Book"),
		];
		const order = ["editions", "editions.format", "editions.year", "author", "title"];
		expect(applyFieldOrder(fields, order).map((f) => fieldOrderKey(fields, f))).toEqual([
			"editions",
			"editions.format",
			"editions.year",
			"author",
			"title",
		]);
	});

	it("never drops a child whose group is not in the set", () => {
		const orphan = field("year", "e1", "Book", "gone");
		const fields = [...inherited, orphan];
		expect(applyFieldOrder(fields, ["author"])).toContain(orphan);
	});

	it("is idempotent — applying the order it produces changes nothing", () => {
		const order = ["author", "title", "year"];
		const once = applyFieldOrder(inherited, order);
		expect(applyFieldOrder(once, fieldOrderKeys(once))).toEqual(once);
	});
});

describe("movedFieldOrder", () => {
	it("swaps a field with its sibling and returns the whole order", () => {
		expect(movedFieldOrder(inherited, "author", -1)).toEqual(["title", "author", "year"]);
		expect(movedFieldOrder(inherited, "title", 1)).toEqual(["year", "title", "author"]);
	});

	it("moves an inherited field as freely as an own one", () => {
		expect(movedFieldOrder(inherited, "title", 1)?.[0]).toBe("year");
	});

	it("answers nothing at the ends of a level", () => {
		expect(movedFieldOrder(inherited, "title", -1)).toBeNull();
		expect(movedFieldOrder(inherited, "author", 1)).toBeNull();
	});

	it("moves a child among its siblings only, and keeps every other level's order", () => {
		const fields = [
			field("editions", "eD", "Book"),
			field("year", "e1", "Book", "eD"),
			field("format", "e2", "Book", "eD"),
			field("author", "b1", "Book"),
		];
		expect(movedFieldOrder(fields, "editions.format", -1)).toEqual([
			"editions",
			"editions.format",
			"editions.year",
			"author",
		]);
	});

	it("answers nothing for a key that names no field", () => {
		expect(movedFieldOrder(inherited, "isbn", 1)).toBeNull();
	});
});

describe("isInherited", () => {
	it("tells a class's own field from one it inherits", () => {
		expect(isInherited(inherited[0], "Book")).toBe(true);
		expect(isInherited(inherited[2], "Book")).toBe(false);
	});
});

describe("renamedFieldOrder", () => {
	it("follows a renamed field, so it keeps the place it was given", () => {
		expect(renamedFieldOrder(["title", "shelf", "author"], "shelf", "rack")).toEqual([
			"title",
			"rack",
			"author",
		]);
	});

	it("takes a renamed group's children with it", () => {
		const order = ["editions", "editions.year", "editions.format", "author"];
		expect(renamedFieldOrder(order, "editions", "printings")).toEqual([
			"printings",
			"printings.year",
			"printings.format",
			"author",
		]);
	});

	it("renames a child without touching a root field of the same name", () => {
		const order = ["publisher", "editions.publisher"];
		expect(renamedFieldOrder(order, "editions.publisher", "editions.house")).toEqual([
			"publisher",
			"editions.house",
		]);
	});

	it("answers nothing when the order does not name the field", () => {
		expect(renamedFieldOrder(["title", "author"], "shelf", "rack")).toBeNull();
	});
});
