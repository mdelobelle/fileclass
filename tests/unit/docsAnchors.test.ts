import { describe, expect, it } from "vitest";

// Plain JS helpers from the demo tooling; only their pure part is exercised.
import { checkDocRef, slugify } from "../../demo/lib/docsAnchors.mjs";

const slug = (s: string): string => slugify(s) as string;

describe("slugify — the anchor Hugo would generate", () => {
	// These pairs are not invented: they were read off the built site, and the rule was
	// checked against all 101 headings of the docs (zero mismatches).
	it("matches the ids Hugo produces", () => {
		expect(slug("Required fields")).toBe("required-fields");
		expect(slug("Nested fields (Object / ObjectList)")).toBe("nested-fields-object--objectlist");
		expect(slug("Durations & interval cycling")).toBe("durations--interval-cycling");
		expect(slug("MultiInput — a list of templated values")).toBe(
			"multiinput--a-list-of-templated-values"
		);
		expect(slug("An interval sequence (`CycleDuration`)")).toBe("an-interval-sequence-cycleduration");
		expect(slug("Set next date (spaced repetition)")).toBe("set-next-date-spaced-repetition");
		expect(slug("Obsidian’s own property type can overwrite your format")).toBe(
			"obsidians-own-property-type-can-overwrite-your-format"
		);
	});
});

describe("checkDocRef — a scenario's doc: before it reaches a description", () => {
	const anchors = {
		fields: new Set(["required-fields", "location"]),
		schema: new Set(["fields", "inheritance"]),
		views: new Set(["validation-columns"]),
	} as unknown as Record<string, Set<string>>;

	it("accepts a page and anchor that exist", () => {
		expect(checkDocRef("fields/#required-fields", anchors)).toEqual({
			ok: true,
			message: "fields/#required-fields",
		});
	});

	it("names the page that actually has the anchor — take 023's mistake", () => {
		const r = checkDocRef("schema/#required-fields", anchors) as { ok: boolean; message: string };
		expect(r.ok).toBe(false);
		expect(r.message).toContain("it is in fields");
	});

	it("rejects a page that doesn't exist, listing the ones that do", () => {
		const r = checkDocRef("nope/#x", anchors) as { ok: boolean; message: string };
		expect(r.ok).toBe(false);
		expect(r.message).toContain("fields, schema, views");
	});

	it("accepts a page without an anchor, and a take with no doc at all", () => {
		expect((checkDocRef("views/", anchors) as { ok: boolean }).ok).toBe(true);
		expect((checkDocRef("", anchors) as { ok: boolean }).ok).toBe(true);
	});
});
