import { describe, expect, it } from "vitest";

import { fittingItems, moreLabel } from "../../src/views/cellOverflow";

/** The measured shape of a cell: an 80px item, a 3px gap, a 30px `+N`, a 78px floor. */
const fit = (widths: number[], available: number) =>
	fittingItems({ widths, available, gap: 3, badge: 30, min: 78 });

describe("fittingItems", () => {
	it("shows everything that fits as drawn", () => {
		expect(fit([80, 80], 260)).toBe(2);
		expect(fit([40, 40, 40], 200)).toBe(3);
	});

	it("counts the rest once the run no longer fits", () => {
		// The reported cell: eighteen links in a 260px column.
		expect(fit(Array(18).fill(90), 260)).toBe(2);
	});

	it("keeps a lone item, however wide — that one truncates instead", () => {
		expect(fit([900], 260)).toBe(1);
		expect(fit([900, 900], 100)).toBe(1);
	});

	it("counts an item's floor, not its width, once the cell is squeezed", () => {
		// Four 200px items are 809px as drawn and nowhere near 300, but three squeezed to their
		// 78px floor are 240 — so the cell shows three and counts one.
		expect(fit([200, 200, 200, 200], 300)).toBe(3);
	});

	it("shows short items the floor would have hidden", () => {
		// Six 30px tags run to 195px with their gaps, over the 180 available. An item costs its
		// own width when that is under the floor, so four of them fit beside the `+2` — where
		// counting the floor for each would have left room for two.
		expect(fit([30, 30, 30, 30, 30, 30], 180)).toBe(4);
	});

	it("holds room for the `+N` it is about to draw", () => {
		// Without the badge's 30px, three items would have been claimed to fit in 250px.
		expect(fit([78, 78, 78, 78], 250)).toBe(2);
	});

	it("says nothing about a cell with nothing, or with one thing", () => {
		expect(fit([], 260)).toBe(0);
		expect(fit([500], 260)).toBe(1);
	});
});

describe("moreLabel", () => {
	it("counts what the cell held back", () => {
		expect(moreLabel(18, 2)).toBe("+16");
	});

	it("stays quiet when everything is on screen", () => {
		expect(moreLabel(3, 3)).toBeNull();
	});
});
