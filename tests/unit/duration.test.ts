import { describe, expect, it } from "vitest";

import {
	addDuration,
	buildDuration,
	durationMs,
	formatDuration,
	isValidDuration,
	parseDuration,
} from "../../src/fields/duration";

describe("parseDuration", () => {
	it("parses the week form", () => {
		expect(parseDuration("P2W")).toEqual({ weeks: 2, days: 0, hours: 0, minutes: 0, seconds: 0 });
	});
	it("parses date + time components", () => {
		expect(parseDuration("P1DT6H30M")).toEqual({
			weeks: 0, days: 1, hours: 6, minutes: 30, seconds: 0,
		});
		expect(parseDuration("PT90M")).toEqual({ weeks: 0, days: 0, hours: 0, minutes: 90, seconds: 0 });
	});
	it("rejects junk and empty markers", () => {
		expect(parseDuration("")).toBeNull();
		expect(parseDuration("P")).toBeNull();
		expect(parseDuration("PT")).toBeNull();
		expect(parseDuration("1W")).toBeNull();
		expect(parseDuration("banana")).toBeNull();
	});
});

describe("buildDuration", () => {
	it("keeps the week form standalone", () => {
		expect(buildDuration({ weeks: 5 })).toBe("P5W");
	});
	it("folds weeks into days when combined with other units (RFC-valid)", () => {
		expect(buildDuration({ weeks: 1, days: 1, hours: 6 })).toBe("P8DT6H");
	});
	it("emits a time-only duration", () => {
		expect(buildDuration({ hours: 1, minutes: 30 })).toBe("PT1H30M");
	});
	it("returns empty for an all-zero duration", () => {
		expect(buildDuration({})).toBe("");
		expect(buildDuration({ weeks: 0, days: 0 })).toBe("");
	});
	it("clamps negatives to zero", () => {
		expect(buildDuration({ days: -3, hours: 2 })).toBe("PT2H");
	});
});

describe("round-trip build → parse", () => {
	it("preserves single-unit durations", () => {
		for (const d of ["P1D", "P2W", "PT30M", "PT1H30M"]) {
			expect(buildDuration(parseDuration(d)!)).toBe(d);
		}
	});
});

describe("isValidDuration", () => {
	it("accepts real durations, rejects empty/junk", () => {
		expect(isValidDuration("P1W")).toBe(true);
		expect(isValidDuration("PT1H30M")).toBe(true);
		expect(isValidDuration("")).toBe(false);
		expect(isValidDuration("P")).toBe(false);
		expect(isValidDuration("nope")).toBe(false);
	});
});

describe("formatDuration", () => {
	it("renders a compact human form", () => {
		expect(formatDuration("P2W")).toBe("2w");
		expect(formatDuration("P1DT6H")).toBe("1d 6h");
		expect(formatDuration("PT1H30M")).toBe("1h 30m");
		expect(formatDuration("")).toBe("");
	});
});

describe("durationMs", () => {
	it("sums a duration to milliseconds", () => {
		expect(durationMs({ weeks: 0, days: 1, hours: 0, minutes: 0, seconds: 0 })).toBe(86_400_000);
		expect(durationMs({ weeks: 1, days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe(7 * 86_400_000);
	});
});

describe("addDuration", () => {
	it("adds to a date (date granularity)", () => {
		expect(addDuration("2026-07-22", "P1W")).toBe("2026-07-29");
		expect(addDuration("2026-07-22", "P1D")).toBe("2026-07-23");
	});
	it("crosses month/year boundaries", () => {
		expect(addDuration("2026-12-31", "P1D")).toBe("2027-01-01");
	});
	it("preserves date+time granularity", () => {
		expect(addDuration("2026-07-22T09:30", "PT1H30M")).toBe("2026-07-22T11:00");
	});
	it("returns null on bad input", () => {
		expect(addDuration("not-a-date", "P1D")).toBeNull();
		expect(addDuration("2026-07-22", "nope")).toBeNull();
	});
});
