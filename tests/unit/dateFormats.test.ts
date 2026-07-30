/*
 * The format a date field is written in: its own, else the plugin-wide default
 * for its type, else the native ISO form. The default is folded into resolved
 * fields, so these assertions are what every consumer downstream sees.
 */
import { describe, expect, it } from "vitest";

import {
	DateFormatDefaults,
	NO_DATE_DEFAULTS,
	defaultFormatFor,
	effectiveDateFormat,
	isDateType,
	withDefaultDateFormats,
} from "../../src/fields/dateFormats";
import { Field, FieldType } from "../../src/schema/field";

const field = (name: string, type: FieldType, options: Record<string, unknown> = {}): Field => ({
	id: name,
	name,
	type,
	options,
	path: "",
	fileClassName: "Book",
});

const defaults: DateFormatDefaults = {
	Date: "DD/MM/YYYY",
	DateTime: "DD/MM/YYYY HH:mm",
	Time: "HH[h]mm",
};

describe("isDateType", () => {
	it("covers the three date types and nothing else", () => {
		expect(["Date", "DateTime", "Time"].map((t) => isDateType(t as FieldType))).toEqual([
			true,
			true,
			true,
		]);
		expect(isDateType("Input")).toBe(false);
		expect(isDateType("CycleDuration")).toBe(false);
	});
});

describe("defaultFormatFor", () => {
	it("picks the default of the matching type", () => {
		expect(defaultFormatFor("Date", defaults)).toBe("DD/MM/YYYY");
		expect(defaultFormatFor("DateTime", defaults)).toBe("DD/MM/YYYY HH:mm");
		expect(defaultFormatFor("Time", defaults)).toBe("HH[h]mm");
	});

	it("is empty for a non-date type, and for a blank default", () => {
		expect(defaultFormatFor("Number", defaults)).toBe("");
		expect(defaultFormatFor("Date", NO_DATE_DEFAULTS)).toBe("");
	});

	it("ignores a default that is only whitespace", () => {
		expect(defaultFormatFor("Date", { ...NO_DATE_DEFAULTS, Date: "   " })).toBe("");
	});
});

describe("effectiveDateFormat", () => {
	it("prefers the field's own format", () => {
		expect(effectiveDateFormat(field("d", "Date", { dateFormat: "YYYY" }), defaults)).toBe("YYYY");
	});

	it("falls back to the default of its type", () => {
		expect(effectiveDateFormat(field("d", "Date"), defaults)).toBe("DD/MM/YYYY");
		expect(effectiveDateFormat(field("t", "Time"), defaults)).toBe("HH[h]mm");
	});

	it("is undefined — the native ISO form — with neither", () => {
		expect(effectiveDateFormat(field("d", "Date"), NO_DATE_DEFAULTS)).toBeUndefined();
	});

	it("is undefined for a type that has no date format", () => {
		expect(effectiveDateFormat(field("n", "Number"), defaults)).toBeUndefined();
	});
});

describe("withDefaultDateFormats", () => {
	it("returns the very same array when every default is blank", () => {
		const fields = [field("d", "Date"), field("n", "Number")];
		expect(withDefaultDateFormats(fields, NO_DATE_DEFAULTS)).toBe(fields);
	});

	it("returns the very same array when no field needs the default", () => {
		const fields = [field("d", "Date", { dateFormat: "YYYY" }), field("n", "Number")];
		expect(withDefaultDateFormats(fields, defaults)).toBe(fields);
	});

	it("folds the default into a date field that declares none", () => {
		const fields = [field("published", "Date"), field("pages", "Number", { min: 1 })];
		const out = withDefaultDateFormats(fields, defaults);
		expect(out[0].options).toEqual({ dateFormat: "DD/MM/YYYY" });
		expect(out[1]).toBe(fields[1]); // untouched fields keep their identity
		expect(fields[0].options).toEqual({}); // the input is never mutated
	});

	it("keeps the other options of the field it copies", () => {
		const fields = [field("published", "Date", { defaultInsertAsLink: true, dateLinkPath: "J/" })];
		expect(withDefaultDateFormats(fields, defaults)[0].options).toEqual({
			defaultInsertAsLink: true,
			dateLinkPath: "J/",
			dateFormat: "DD/MM/YYYY",
		});
	});

	it("leaves a legacy array-shaped options field alone", () => {
		const legacy: Field = { ...field("d", "Date"), options: [] };
		expect(withDefaultDateFormats([legacy], defaults)[0]).toBe(legacy);
	});
});
