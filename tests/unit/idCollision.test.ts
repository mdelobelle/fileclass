import { describe, expect, it } from "vitest";

import { addFieldDef, collectFieldIds, RawFieldEntry } from "../../src/schema/fileClassWrite";
import { childFieldsOf, Field } from "../../src/schema/field";
import { resolveInheritedFields } from "../../src/schema/inheritance";

/**
 * Memory flagged this for take 024, and the take is what makes it reachable: a nested
 * field's parentage is a `path` — its parent's **id** — matched over the *resolved*
 * (cross-class) field set, while ids used to be drawn unique within one class only. Two
 * classes of one chain drawing the same six characters would therefore hand one group the
 * other's children.
 *
 * Measured before fixing: `childFieldsOf` returned Media's `producer` among Book's
 * `storage` children. The fix is at the source — a new id avoids every id of the chain —
 * so the first test is the one that matters, and the second records what a collision would
 * still do to a hand-written file.
 */
const field = (name: string, id: string, path: string, owner: string): Field => ({
	id,
	name,
	type: "Input",
	options: [],
	path,
	fileClassName: owner,
});

describe("a new field's id", () => {
	it("avoids ids used anywhere in the inheritance chain", () => {
		// Book's own file knows nothing of Media's ids; the caller passes the union.
		const bookFields: RawFieldEntry[] = [{ name: "shelf", id: "bShelf", type: "Input", options: [], path: "" }];
		const chainIds = new Set([...collectFieldIds(bookFields), "mCredi", "mProdu"]);
		const drawn = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const entry = addFieldDef([...bookFields], { name: `f${i}`, type: "Input" }, new Set(chainIds));
			drawn.add(entry.id as string);
		}
		expect([...drawn].some((id) => chainIds.has(id))).toBe(false);
	});

	it("still avoids the ids of its own class", () => {
		const fields: RawFieldEntry[] = [{ name: "a", id: "aaa111", type: "Input", options: [], path: "" }];
		const entry = addFieldDef(fields, { name: "b", type: "Input" });
		expect(entry.id).not.toBe("aaa111");
	});
});

describe("what a colliding id would still do", () => {
	// Reachable only by hand-editing a class note (or importing one), which is why the fix
	// is on generation rather than on lookup: matching parentage by owner as well as by
	// path would stop a subclass from overriding an inherited child, which is a feature.
	it("hands one group the other's children — the case the generator now prevents", () => {
		const media = [field("credits", "dup123", "", "Media"), field("producer", "m2", "dup123", "Media")];
		const book = [field("storage", "dup123", "", "Book"), field("room", "b2", "dup123", "Book")];
		const resolved = resolveInheritedFields("Book", ["Media"], (n) => (n === "Book" ? book : media), () => []);
		const storage = resolved.find((f) => f.name === "storage")!;
		expect(childFieldsOf(resolved, storage).map((f) => f.name)).toEqual(["room", "producer"]);
	});
});
