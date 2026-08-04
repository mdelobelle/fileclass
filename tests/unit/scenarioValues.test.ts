import { describe, expect, it } from "vitest";

// The demo runner is plain JS; only the pure list split is exercised here.
import { splitValues } from "../../demo/lib/scenario.mjs";

const split = (raw: string): string[] => splitValues(raw) as string[];

describe("splitValues — a step's values, one per box", () => {
	it("keeps a single value as one item", () => {
		expect(split("Attic")).toEqual(["Attic"]);
	});

	it("splits a list so one chord press serves one box", () => {
		// The bug this answers: a step filling a room, a unit and a level typed all
		// three into the first field, which is worse than typing nothing.
		expect(split("Attic | B | 1")).toEqual(["Attic", "B", "1"]);
	});

	it("leaves commas and spaces inside a value alone", () => {
		// Coordinates are a single value that contains a comma and a space, which is
		// why the separator is ` | ` and not `,`.
		expect(split("50.84795104992325, 4.348730734603368")).toEqual([
			"50.84795104992325, 4.348730734603368",
		]);
		expect(split("Living room | Study")).toEqual(["Living room", "Study"]);
	});

	it("drops empty slots rather than typing nothing into a field", () => {
		expect(split("A |  | B")).toEqual(["A", "B"]);
		expect(split("")).toEqual([]);
	});
});

describe("splitValues — a block typed in one go", () => {
	it("turns a \\n escape into a real newline, keeping the value whole", () => {
		// The credits of an album are one value in one box: the chord must send the line
		// breaks, and the caption shows them as ⏎ so it stays two lines tall.
		expect(split("producer: Teo\\nengineer: Fred")).toEqual(["producer: Teo\nengineer: Fred"]);
	});

	it("still separates values on ` | ` around a multi-line one", () => {
		expect(split("a: 1\\nb: 2 | c: 3")).toEqual(["a: 1\nb: 2", "c: 3"]);
	});
});
