/*
 * One gesture per field type, shared by every control surface (the Properties
 * buttons, a fileclass-table cell, the note-fields modal). The mapping is the
 * contract these surfaces agree on, so it's tested rather than trusted.
 */
import { describe, expect, it } from "vitest";

import { controlActionFor, controlLabel } from "../../src/fields/controlAction";
import { FIELD_TYPES, FieldType } from "../../src/schema/field";

describe("controlActionFor", () => {
	it("advances a Cycle", () => {
		expect(controlActionFor("Cycle")).toBe("cycle");
	});

	it("flips a Boolean", () => {
		expect(controlActionFor("Boolean")).toBe("toggle");
	});

	it("opens the input for everything else", () => {
		for (const type of ["Input", "Number", "Select", "Date", "File", "Object"] as FieldType[]) {
			expect(controlActionFor(type)).toBe("edit");
		}
	});

	it("has an answer for every field type", () => {
		for (const type of FIELD_TYPES) {
			expect(["cycle", "toggle", "edit"]).toContain(controlActionFor(type));
		}
	});

	it("keeps CycleDuration on the input — it is not a Cycle", () => {
		// Same prefix, different type: its editor manages a list of intervals.
		expect(controlActionFor("CycleDuration")).toBe("edit");
	});
});

describe("controlLabel", () => {
	it("names each gesture with its own icon", () => {
		expect(controlLabel("cycle")).toEqual({ icon: "rotate-cw", verb: "Next value", alt: true });
		expect(controlLabel("toggle")).toEqual({ icon: "toggle-left", verb: "Toggle", alt: true });
		expect(controlLabel("edit")).toEqual({ icon: "pencil", verb: "Edit", alt: false });
	});

	it("offers the Alt-click escape exactly where the gesture writes a value", () => {
		// `edit` already opens the input, so a modifier would have nothing to add.
		expect(controlLabel("cycle").alt).toBe(true);
		expect(controlLabel("toggle").alt).toBe(true);
		expect(controlLabel("edit").alt).toBe(false);
	});
});
