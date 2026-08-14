import { describe, expect, it } from "vitest";

import { SUGGEST_PAGE, grownTo, shouldGrow, truncationLabel } from "../../src/ui/suggestPaging";

const at = (scrollTop: number) => ({ scrollTop, clientHeight: 400, scrollHeight: 2000 });

describe("shouldGrow", () => {
	it("waits until the reader is near the end of what is drawn", () => {
		expect(shouldGrow(at(0), SUGGEST_PAGE, 400)).toBe(false);
		expect(shouldGrow(at(1000), SUGGEST_PAGE, 400)).toBe(false);
		expect(shouldGrow(at(1600), SUGGEST_PAGE, 400)).toBe(true);
	});

	it("stops at the end of the matches, however far it is scrolled", () => {
		expect(shouldGrow(at(1600), 400, 400)).toBe(false);
		expect(shouldGrow(at(1600), 500, 400)).toBe(false);
	});
});

describe("grownTo", () => {
	it("adds a page", () => {
		expect(grownTo(100, 400)).toBe(200);
	});

	it("never overshoots the total", () => {
		expect(grownTo(100, 130)).toBe(130);
	});
});

describe("truncationLabel", () => {
	it("says what is missing while something is", () => {
		expect(truncationLabel(100, 412)).toBe("100 of 412 — scroll for more");
	});

	it("says nothing once everything is on screen", () => {
		expect(truncationLabel(412, 412)).toBeNull();
		expect(truncationLabel(100, 100)).toBeNull();
	});
});
