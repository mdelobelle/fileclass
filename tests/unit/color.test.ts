import { describe, expect, it } from "vitest";

import { isValidCssColor } from "../../src/fields/color";

describe("isValidCssColor", () => {
	it("accepts hex (3/4/6/8 digits)", () => {
		expect(isValidCssColor("#fb464c")).toBe(true);
		expect(isValidCssColor("#fff")).toBe(true);
		expect(isValidCssColor("#ffff")).toBe(true);
		expect(isValidCssColor("#ff00aa80")).toBe(true);
		expect(isValidCssColor("#ggg")).toBe(false);
		expect(isValidCssColor("#12345")).toBe(false);
	});
	it("accepts rgb()/rgba()/hsl()/hsla()", () => {
		expect(isValidCssColor("rgb(251, 70, 76)")).toBe(true);
		expect(isValidCssColor("rgba(0,0,0,0.5)")).toBe(true);
		expect(isValidCssColor("hsl(210 50% 40%)")).toBe(true);
		expect(isValidCssColor("rgb()")).toBe(false);
	});
	it("accepts named colors (case-insensitive) incl. transparent", () => {
		expect(isValidCssColor("red")).toBe(true);
		expect(isValidCssColor("RebeccaPurple")).toBe(true);
		expect(isValidCssColor("transparent")).toBe(true);
		expect(isValidCssColor("banana")).toBe(false);
	});
	it("rejects empty / non-strings", () => {
		expect(isValidCssColor("")).toBe(false);
		expect(isValidCssColor("   ")).toBe(false);
	});
});
