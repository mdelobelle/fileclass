import { describe, expect, it } from "vitest";

import {
	addFieldDef,
	buildOptionUpdates,
	collectFieldIds,
	generateFieldId,
	moveFieldDef,
	RawFieldEntry,
	removeFieldDef,
	updateFieldDef,
} from "../../src/schema/fileClassWrite";

describe("generateFieldId", () => {
	it("produces a 6-char alphanumeric id", () => {
		const id = generateFieldId();
		expect(id).toMatch(/^[A-Za-z0-9]{6}$/);
	});
	it("avoids collisions with existing ids", () => {
		// A rand that first yields all-'A' (→ "AAAAAA"), then varies.
		const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
		let i = 0;
		const rand = () => seq[Math.min(i++, seq.length - 1)];
		const id = generateFieldId(new Set(["AAAAAA"]), rand);
		expect(id).not.toBe("AAAAAA");
	});
});

describe("field definition transforms", () => {
	const seed = (): RawFieldEntry[] => [
		{ name: "a", id: "1", type: "Input", path: "", options: [], command: { keep: true } },
		{ name: "b", id: "2", type: "Number", path: "" },
	];

	it("adds a field with a fresh id, preserving others", () => {
		const fields = seed();
		const created = addFieldDef(fields, { name: "c", type: "Select" });
		expect(fields).toHaveLength(3);
		expect(created.name).toBe("c");
		expect(created.id).toMatch(/^[A-Za-z0-9]{6}$/);
		expect(collectFieldIds(fields).has(created.id as string)).toBe(true);
	});

	it("updates name/type in place, keeping unknown keys (D5)", () => {
		const fields = seed();
		updateFieldDef(fields, "1", { name: "a2", type: "Boolean" });
		expect(fields[0]).toMatchObject({ name: "a2", type: "Boolean", command: { keep: true } });
	});

	it("removes by id", () => {
		const fields = seed();
		removeFieldDef(fields, "1");
		expect(fields.map((f) => f.id)).toEqual(["2"]);
	});

	it("moves up/down and clamps at the edges", () => {
		const fields = seed();
		moveFieldDef(fields, "2", -1);
		expect(fields.map((f) => f.id)).toEqual(["2", "1"]);
		moveFieldDef(fields, "2", -1); // already first → no-op
		expect(fields.map((f) => f.id)).toEqual(["2", "1"]);
	});
});

describe("buildOptionUpdates", () => {
	it("maps values and nulls empty lists/blanks (MDM parity)", () => {
		expect(
			buildOptionUpdates({
				icon: " book ",
				extends: "",
				limit: 20,
				mapWithTag: true,
				tagNames: ["x"],
				filesPaths: [],
			})
		).toEqual({
			icon: "book",
			extends: null,
			limit: 20,
			mapWithTag: true,
			tagNames: ["x"],
			filesPaths: null,
			bookmarksGroups: null,
			excludes: null,
		});
	});
});
