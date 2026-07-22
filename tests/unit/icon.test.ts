import { describe, expect, it } from "vitest";

import { isPlausibleIconId, normalizeIconId } from "../../src/fields/icon";

describe("normalizeIconId", () => {
	it("strips the lucide- prefix, leaves other ids", () => {
		expect(normalizeIconId("lucide-map-pin")).toBe("map-pin");
		expect(normalizeIconId("map-pin")).toBe("map-pin");
		expect(normalizeIconId("my-plugin-custom")).toBe("my-plugin-custom");
	});
});

describe("isPlausibleIconId", () => {
	it("accepts bare kebab/word ids", () => {
		expect(isPlausibleIconId("map-pin")).toBe(true);
		expect(isPlausibleIconId("star")).toBe(true);
		expect(isPlausibleIconId("custom_icon2")).toBe(true);
	});
	it("rejects spaces and non-id shapes", () => {
		expect(isPlausibleIconId("map pin")).toBe(false);
		expect(isPlausibleIconId("")).toBe(false);
		expect(isPlausibleIconId("a/b")).toBe(false);
	});
});
