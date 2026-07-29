/*
 * Stepping arithmetic behind the − / + buttons of a Number input. The rules a
 * user actually notices: an empty field starts from `min`, the value never leaves
 * `[min, max]`, and a fractional step doesn't leak float noise into frontmatter.
 */
import { describe, expect, it } from "vitest";

import { stepNumber, stepSize } from "../../src/fields/numberStep";

describe("stepSize", () => {
	it("defaults to 1", () => {
		expect(stepSize({})).toBe(1);
	});

	it("uses the configured step", () => {
		expect(stepSize({ step: 5 })).toBe(5);
		expect(stepSize({ step: 0.25 })).toBe(0.25);
	});

	it("falls back to 1 for a step that couldn't move anything", () => {
		expect(stepSize({ step: 0 })).toBe(1);
		expect(stepSize({ step: -3 })).toBe(1);
		expect(stepSize({ step: Number.NaN })).toBe(1);
	});
});

describe("stepNumber", () => {
	it("steps an existing value by one step", () => {
		expect(stepNumber(412, {}, 1)).toBe(413);
		expect(stepNumber(412, {}, -1)).toBe(411);
		expect(stepNumber(10, { step: 5 }, 1)).toBe(15);
	});

	it("reads the current value from the input's string", () => {
		expect(stepNumber("41", {}, 1)).toBe(42);
		expect(stepNumber(" 41 ", {}, 1)).toBe(42);
	});

	it("shows min on the first click of an empty field, either direction", () => {
		expect(stepNumber("", { min: 1 }, 1)).toBe(1);
		expect(stepNumber("", { min: 1 }, -1)).toBe(1);
		expect(stepNumber(null, { min: 10, step: 5 }, 1)).toBe(10);
		expect(stepNumber(undefined, { min: -10 }, 1)).toBe(-10);
	});

	it("shows zero when the empty field has no min", () => {
		expect(stepNumber("", {}, 1)).toBe(0);
		expect(stepNumber("", {}, -1)).toBe(0);
		expect(stepNumber("   ", { step: 5 }, 1)).toBe(0);
	});

	it("then steps normally from that first value", () => {
		expect(stepNumber(stepNumber("", { min: 1 }, 1), { min: 1 }, 1)).toBe(2);
		expect(stepNumber(stepNumber("", {}, 1), {}, -1)).toBe(-1);
	});

	it("treats an unparseable field as empty", () => {
		expect(stepNumber("many", { min: 1 }, 1)).toBe(1);
		expect(stepNumber("many", {}, 1)).toBe(0);
	});

	it("keeps that first value inside the bounds", () => {
		expect(stepNumber("", { max: -5 }, 1)).toBe(-5); // no min, but 0 is too high
	});

	it("never leaves the bounds", () => {
		expect(stepNumber(5000, { min: 1, max: 5000 }, 1)).toBe(5000);
		expect(stepNumber(1, { min: 1, max: 5000 }, -1)).toBe(1);
		expect(stepNumber(4999, { max: 5000, step: 10 }, 1)).toBe(5000);
	});

	it("keeps fractional steps clean", () => {
		expect(stepNumber(0.1, { step: 0.2 }, 1)).toBe(0.3);
		expect(stepNumber(3, { step: 0.1 }, -1)).toBe(2.9);
		expect(stepNumber(2.5, { step: 0.25 }, 1)).toBe(2.75);
	});

	it("handles a negative range", () => {
		expect(stepNumber("", { min: -10, max: 0 }, 1)).toBe(-10);
		expect(stepNumber(-10, { min: -10, max: 0 }, 1)).toBe(-9);
		expect(stepNumber(-10, { min: -10 }, -1)).toBe(-10);
	});
});
