import { describe, expect, it } from "vitest";

import { widgetForFieldType } from "../../src/fields/propertyWidget";

describe("widgetForFieldType", () => {
	it("names the widget where the mapping is beyond argument", () => {
		expect(widgetForFieldType("Boolean")).toBe("checkbox");
		expect(widgetForFieldType("Number")).toBe("number");
		expect(widgetForFieldType("Date")).toBe("date");
		expect(widgetForFieldType("DateTime")).toBe("datetime");
	});

	it("calls a list of values a list", () => {
		for (const type of ["Multi", "MultiInput", "MultiFile", "MultiMedia", "CycleDuration"] as const)
			expect(widgetForFieldType(type)).toBe("multitext");
	});

	it("stays quiet where a widget would be a guess", () => {
		// A File holds a link, which Obsidian would call text anyway; an Object holds a map, which
		// no widget describes. Saying so would overwrite a reader's own choice with an approximation.
		for (const type of ["Input", "Select", "File", "Media", "Object", "ObjectList", "JSON", "Time"] as const)
			expect(widgetForFieldType(type)).toBeNull();
	});
})
