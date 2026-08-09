import { describe, expect, it } from "vitest";

import { renameProperty } from "../../src/schema/renameProperty";

describe("renameProperty", () => {
	it("renames a root key where it stands, keeping the order", () => {
		// Order is what the Properties panel shows; a rename that reshuffles it would
		// be a second, unasked-for change.
		const fm = { fileClass: "Book", shelf: "Study · A-3", pages: 412 };
		const out = renameProperty(fm, [], "shelf", "storage");
		expect(out.renamed).toBe(1);
		expect(Object.keys(out.value as object)).toEqual(["fileClass", "storage", "pages"]);
		expect((out.value as Record<string, unknown>).storage).toBe("Study · A-3");
	});

	it("says nothing to do when the note doesn't carry the key", () => {
		const out = renameProperty({ fileClass: "Book" }, [], "shelf", "storage");
		expect(out.renamed).toBe(0);
	});

	it("renames inside a group", () => {
		const fm = { storage: { room: "Study", shelf: { unit: "A", level: 3 } } };
		const out = renameProperty(fm, ["storage", "shelf"], "unit", "bay");
		expect(out.renamed).toBe(1);
		expect(out.value).toEqual({ storage: { room: "Study", shelf: { bay: "A", level: 3 } } });
	});

	it("renames in every item of a list of groups", () => {
		const fm = { editions: [{ year: 1965 }, { year: 1978 }] };
		const out = renameProperty(fm, ["editions"], "year", "published");
		expect(out.renamed).toBe(2);
		expect(out.value).toEqual({ editions: [{ published: 1965 }, { published: 1978 }] });
	});

	it("refuses to overwrite a name that is already taken", () => {
		// Better to do nothing than to silently drop a value the operator can see.
		const fm = { shelf: "A-3", storage: { room: "Study" } };
		const out = renameProperty(fm, [], "shelf", "storage");
		expect(out.renamed).toBe(0);
		expect(out.value).toBe(fm);
	});

	it("leaves scalars, missing ancestors and same-name renames alone", () => {
		expect(renameProperty("text", [], "a", "b").renamed).toBe(0);
		expect(renameProperty({ a: 1 }, ["nope"], "a", "b").renamed).toBe(0);
		expect(renameProperty({ a: 1 }, [], "a", "a").renamed).toBe(0);
	});
});
