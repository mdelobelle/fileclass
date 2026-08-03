import { describe, expect, it } from "vitest";

import { handlesKey, nextGridTarget } from "../../src/ui/rowGridKeyboard";

// Three rows as the schema editor builds them: a plain field, a group (which has the
// extra Children action), then a plain field again.
const PLAIN = ["Move up", "Move down", "Edit", "Remove"];
const GROUP = ["Move up", "Move down", "Children", "Edit", "Remove"];
const rows = [PLAIN, GROUP, PLAIN];

const at = (row: number, action: number) => ({ row, action });

describe("nextGridTarget", () => {
	it("moves down keeping the action, not the column", () => {
		// Edit is column 2 in a plain row and column 3 in a group row. By index, this
		// move would land on Children; by identity it lands on Edit.
		expect(nextGridTarget(rows, at(0, 2), "ArrowDown")).toEqual(at(1, 3));
		// And back up again, the same way.
		expect(nextGridTarget(rows, at(1, 3), "ArrowUp")).toEqual(at(0, 2));
	});

	it("never slides Edit onto Remove", () => {
		const down = nextGridTarget(rows, at(0, 2), "ArrowDown");
		expect(GROUP[down!.action]).toBe("Edit");
		const up = nextGridTarget(rows, at(2, 2), "ArrowUp");
		expect(GROUP[up!.action]).toBe("Edit");
	});

	it("falls back to the nearest column when the action doesn't exist there", () => {
		// Children (column 2 of a group) has no equivalent in a plain row: keep the
		// column rather than jumping to an unrelated action.
		const target = nextGridTarget(rows, at(1, 2), "ArrowDown");
		expect(target).toEqual(at(2, 2));
		expect(PLAIN[target!.action]).toBe("Edit");
	});

	it("moves within a row on left and right", () => {
		expect(nextGridTarget(rows, at(1, 2), "ArrowRight")).toEqual(at(1, 3));
		expect(nextGridTarget(rows, at(1, 2), "ArrowLeft")).toEqual(at(1, 1));
	});

	it("clamps instead of wrapping — Tab is how you leave", () => {
		expect(nextGridTarget(rows, at(0, 0), "ArrowUp")).toBeNull();
		expect(nextGridTarget(rows, at(2, 0), "ArrowDown")).toBeNull();
		expect(nextGridTarget(rows, at(0, 0), "ArrowLeft")).toBeNull();
		expect(nextGridTarget(rows, at(0, 3), "ArrowRight")).toBeNull();
	});

	it("jumps to the ends, keeping the action", () => {
		expect(nextGridTarget(rows, at(1, 3), "Home")).toEqual(at(0, 2));
		expect(nextGridTarget(rows, at(0, 2), "End")).toEqual(at(2, 2));
		// Already there: nothing to do.
		expect(nextGridTarget(rows, at(0, 2), "Home")).toBeNull();
	});

	it("answers only its own keys, and survives an empty list", () => {
		expect(handlesKey("ArrowDown")).toBe(true);
		expect(handlesKey("Enter")).toBe(false);
		expect(nextGridTarget(rows, at(0, 0), "Enter")).toBeNull();
		expect(nextGridTarget([], at(0, 0), "ArrowDown")).toBeNull();
	});
});
