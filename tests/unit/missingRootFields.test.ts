/*
 * Which fields a note is missing. Extracted from insertMissingFields so the
 * Properties action button can name the count without touching the note — same
 * definition of "missing" on both sides, or the button would lie.
 */
import { describe, expect, it } from "vitest";

import { missingRootFields } from "../../src/fields/missingFields";
import { Field, FieldType } from "../../src/schema/field";

const field = (name: string, extra: Partial<Field> = {}): Field =>
	({
		name,
		id: name,
		type: "Input" as FieldType,
		options: {},
		path: "",
		fileClassName: "Book",
		...extra,
	}) as Field;

const none = () => false;

describe("missingRootFields", () => {
	it("returns the fields the note doesn't carry, in declaration order", () => {
		const fields = [field("publisher"), field("pages"), field("genre")];
		const present = (f: Field) => f.name === "pages";
		expect(missingRootFields(fields, present).map((f) => f.name)).toEqual([
			"publisher",
			"genre",
		]);
	});

	it("is empty when the note carries everything", () => {
		expect(missingRootFields([field("publisher")], () => true)).toEqual([]);
	});

	it("skips nested fields — only root fields are inserted", () => {
		const fields = [field("author"), field("first name", { path: "author" })];
		expect(missingRootFields(fields, none).map((f) => f.name)).toEqual(["author"]);
	});

	it("counts a name shared by two fileClasses once", () => {
		const fields = [field("pages"), field("pages", { fileClassName: "Comic", id: "other" })];
		expect(missingRootFields(fields, none)).toHaveLength(1);
	});

	it("keeps the first of two same-named fields, so its type decides the default", () => {
		const fields = [
			field("pages", { type: "Number" as FieldType }),
			field("pages", { type: "Input" as FieldType, id: "other" }),
		];
		expect(missingRootFields(fields, none)[0].type).toBe("Number");
	});

	it("has nothing to report for a note with no fields", () => {
		expect(missingRootFields([], none)).toEqual([]);
	});
});
