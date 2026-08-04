import { describe, expect, it } from "vitest";

import { clampOffset } from "../../src/ui/modalDrag";

// A modal 400×300 sitting centred in a 1000×800 viewport, with no drag applied yet.
const box = { left: 300, top: 250, width: 400, height: 300 };
const viewport = { width: 1000, height: 800 };
const none = { x: 0, y: 0 };

describe("clampOffset — a dragged modal stays reachable", () => {
	it("follows the pointer when there is room", () => {
		expect(clampOffset(box, none, { x: 120, y: -60 }, viewport)).toEqual({ x: 120, y: -60 });
	});

	it("accumulates on top of a previous drag", () => {
		const box2 = { ...box, left: 420, top: 190 }; // already moved by (120, -60)
		expect(clampOffset(box2, { x: 120, y: -60 }, { x: 30, y: 10 }, viewport)).toEqual({
			x: 150,
			y: -50,
		});
	});

	it("never lets the title leave the top of the screen", () => {
		// Dragging far up stops where the modal's own top edge was: the handle is what you
		// would need to grab to bring it back.
		expect(clampOffset(box, none, { x: 0, y: -9999 }, viewport).y).toBe(-250);
	});

	it("keeps a recognisable piece on screen when dragged off any other edge", () => {
		// 120px, not a sliver: at 48 the modal read as gone (looked at, not reasoned about).
		expect(clampOffset(box, none, { x: 9999, y: 0 }, viewport).x).toBe(1000 - 300 - 120);
		expect(clampOffset(box, none, { x: -9999, y: 0 }, viewport).x).toBe(120 - 300 - 400);
		expect(clampOffset(box, none, { x: 0, y: 9999 }, viewport).y).toBe(800 - 250 - 120);
	});

	it("survives a viewport smaller than the modal", () => {
		const tiny = { width: 320, height: 200 };
		const o = clampOffset(box, none, { x: -500, y: -500 }, tiny);
		expect(Number.isFinite(o.x)).toBe(true);
		expect(Number.isFinite(o.y)).toBe(true);
	});
});
