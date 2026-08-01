/*
 * Reading and writing a date field's stored value. The point of these is the
 * agreement between the picker's Save and "Set next date": both go through
 * storedDateValue, so a shortcut can't quietly turn a linked date into a bare one.
 */
import { describe, expect, it } from "vitest";

import { dateTextOf, isDateLink, nativeDateFormat, storedDateValue } from "../../src/fields/dateValue";
import { FieldType } from "../../src/schema/field";

/** Stands in for moment: only the formats these tests exercise. */
const format = (iso: string, fmt: string): string => {
	const [date, time = ""] = iso.split("T");
	const [y, m, d] = date.split("-");
	const map: Record<string, string> = {
		YYYY: y,
		MM: m,
		DD: d,
		"YYYY-MM-DD": date,
		"DD/MM/YYYY": `${d}/${m}/${y}`,
		"YYYY-MM-DD ddd": `${date} Thu`,
		"HH:mm": time,
	};
	if (!(fmt in map)) throw new Error(`unexpected format: ${fmt}`);
	return map[fmt];
};

describe("nativeDateFormat", () => {
	it("gives the sortable native form per type, and a date by default", () => {
		expect(nativeDateFormat("Date")).toBe("YYYY-MM-DD");
		expect(nativeDateFormat("DateTime")).toBe("YYYY-MM-DD[T]HH:mm");
		expect(nativeDateFormat("Time")).toBe("HH:mm");
		expect(nativeDateFormat("Input" as FieldType)).toBe("YYYY-MM-DD");
	});
});

describe("isDateLink", () => {
	it("recognises a link and an embed, whatever the surrounding space", () => {
		expect(isDateLink("[[2026-10-29]]")).toBe(true);
		expect(isDateLink("  ![[Daily/2026-10-29|2026-10-29]]  ")).toBe(true);
	});

	it("rejects a plain date and a value that merely contains a link", () => {
		expect(isDateLink("2026-10-29")).toBe(false);
		expect(isDateLink("see [[2026-10-29]] tomorrow")).toBe(false);
	});
});

describe("dateTextOf", () => {
	it("returns a plain value untouched, trimmed", () => {
		expect(dateTextOf("  2026-10-29 ")).toBe("2026-10-29");
	});

	it("takes the basename of a link target, dropping folders and the alias", () => {
		expect(dateTextOf("[[Daily/Notes/2026/10/2026-10-29 Thu|2026-10-29 Thu]]")).toBe(
			"2026-10-29 Thu"
		);
		expect(dateTextOf("[[2026-10-29#Log]]")).toBe("2026-10-29");
	});

	it("is empty for an empty value", () => {
		expect(dateTextOf("   ")).toBe("");
	});
});

describe("storedDateValue", () => {
	it("stores the native form when the field has no format", () => {
		expect(storedDateValue("2026-10-29", {}, false, format)).toBe("2026-10-29");
	});

	it("applies the field's format", () => {
		expect(storedDateValue("2026-10-29", { dateFormat: "DD/MM/YYYY" }, false, format)).toBe(
			"29/10/2026"
		);
	});

	it("wraps as a link with the date-dependent path and alias — the picker's shape", () => {
		const value = storedDateValue(
			"2026-10-29",
			{
				dateFormat: "YYYY-MM-DD ddd",
				linkPath: "Daily/Notes/{{YYYY}}/{{MM}}/",
				alias: true,
			},
			true,
			format
		);
		expect(value).toBe("[[Daily/Notes/2026/10/2026-10-29 Thu|2026-10-29 Thu]]");
	});

	it("keeps the formatted date out of the link path when asLink is false", () => {
		const value = storedDateValue(
			"2026-10-29",
			{ dateFormat: "YYYY-MM-DD ddd", linkPath: "Daily/", alias: true },
			false,
			format
		);
		expect(value).toBe("2026-10-29 Thu");
	});

	it("carries a DateTime's time part through", () => {
		expect(storedDateValue("2026-10-29T09:30", {}, false, format)).toBe("2026-10-29T09:30");
	});
});
