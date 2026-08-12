import { describe, expect, it } from "vitest";

import {
	EMBEDDED_BASE_SELECTOR,
	needsRedraw,
	surfacesToRedraw,
} from "../../src/views/redrawOnRegister";

const surface = (viewType: string, holdsEmbeddedBase = false) => ({ viewType, holdsEmbeddedBase });

describe("which open surfaces are redrawn once the view type exists", () => {
	it("redraws a base in its own tab", () => {
		expect(needsRedraw(surface("bases"))).toBe(true);
	});

	it("redraws a note that embeds one", () => {
		// The case the first version missed: an embed lives in a markdown leaf, so iterating leaves
		// of type `bases` left every dashboard reading "Unknown view type" until it was touched.
		expect(needsRedraw(surface("markdown", true))).toBe(true);
	});

	it("leaves a note that embeds nothing alone", () => {
		expect(needsRedraw(surface("markdown"))).toBe(false);
	});

	it("asks what a surface holds, not what it is called", () => {
		// A canvas card renders a note, and a note may embed a base. Restricting the rule to
		// markdown would need another fix the next time a surface renders notes.
		expect(needsRedraw(surface("canvas", true))).toBe(true);
		expect(needsRedraw(surface("something-nobody-has-written-yet", true))).toBe(true);
	});

	it("leaves every other tab alone", () => {
		for (const type of ["canvas", "graph", "file-explorer", "search", ""]) {
			expect(needsRedraw(surface(type))).toBe(false);
		}
	});
});

describe("selecting them", () => {
	it("keeps what the caller attached, and drops the rest", () => {
		const open = [
			{ ...surface("markdown"), leaf: "a" },
			{ ...surface("bases"), leaf: "b" },
			{ ...surface("markdown", true), leaf: "c" },
			{ ...surface("graph"), leaf: "d" },
		];
		expect(surfacesToRedraw(open).map((s) => s.leaf)).toEqual(["b", "c"]);
	});

	it("has nothing to do on an empty workspace", () => {
		expect(surfacesToRedraw([])).toEqual([]);
	});
});

describe("the selector the caller runs", () => {
	/*
	 * These tests run without a DOM, so this does not check that the selector *matches* anything —
	 * only that it still names the three spellings a note can use, so removing one is a visible
	 * change rather than a silent one. The matching itself is verified in the app, on take 036c's
	 * vault, where two embedded tables came back reading "Unknown view type" before this fix.
	 */
	it("names an embed of a base file", () => {
		expect(EMBEDDED_BASE_SELECTOR).toContain('.internal-embed[src$=".base"]');
	});

	it("names an embed of one of its views", () => {
		expect(EMBEDDED_BASE_SELECTOR).toContain('.internal-embed[src*=".base#"]');
	});

	it("names a base block written in the note", () => {
		expect(EMBEDDED_BASE_SELECTOR).toContain(".block-language-base");
	});
});
