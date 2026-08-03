import { describe, expect, it } from "vitest";

import { snapshot } from "../../src/ui/draftSnapshot";

describe("snapshot — the cheapest 'has this changed?'", () => {
	it("is equal for the same draft", () => {
		expect(snapshot({ name: "publisher", type: "Object" })).toBe(
			snapshot({ name: "publisher", type: "Object" })
		);
	});

	it("ignores the order keys were inserted in", () => {
		// Re-entering the same values in another order is not a change, and reporting
		// it as one would make the warning cry wolf.
		expect(snapshot({ a: 1, b: 2 })).toBe(snapshot({ b: 2, a: 1 }));
	});

	it("differs on a changed value, a new key, or a removed one", () => {
		const base = snapshot({ name: "publisher", city: "" });
		expect(snapshot({ name: "publishers", city: "" })).not.toBe(base);
		expect(snapshot({ name: "publisher", city: "", founded: 1965 })).not.toBe(base);
		expect(snapshot({ name: "publisher" })).not.toBe(base);
	});

	it("keeps list order, which is meaningful", () => {
		expect(snapshot([1, 2])).not.toBe(snapshot([2, 1]));
	});

	it("handles the empty and absent cases a fresh draft starts from", () => {
		expect(snapshot({})).toBe(snapshot({}));
		expect(snapshot(undefined)).toBe(snapshot(undefined));
		expect(snapshot("")).not.toBe(snapshot(undefined));
	});
});
