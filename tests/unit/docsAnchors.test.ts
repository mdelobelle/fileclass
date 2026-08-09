import { describe, expect, it } from "vitest";

// Plain JS helpers from the demo tooling; only their pure part is exercised.
import { checkDocRef, placeVideoShortcode, slugify } from "../../demo/lib/docsAnchors.mjs";

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

describe("placeVideoShortcode — the paste nobody was doing", () => {
	const page = ["# Views", "", "## Generating a base", "", "Run the command.", ""].join("\n");
	const place = (md: string, n: string, anchor: string): { text: string; placed: string | null } =>
		placeVideoShortcode(md, n, anchor) as { text: string; placed: string | null };

	it("puts the shortcode under the heading the anchor names", () => {
		const { text, placed } = place(page, "032", "generating-a-base");
		expect(placed).toBe("written");
		expect(text.split("\n").slice(2, 6)).toEqual([
			"## Generating a base",
			"",
			'{{< video "032" >}}',
			"",
		]);
	});

	it("is idempotent — a second sync leaves the page alone", () => {
		const once = place(page, "032", "generating-a-base").text;
		const twice = place(once, "032", "generating-a-base");
		expect(twice.placed).toBe("already");
		expect(twice.text).toBe(once);
	});

	it("refuses to guess when no heading matches", () => {
		const { text, placed } = place(page, "032", "a-section-nobody-wrote");
		expect(placed).toBeNull();
		expect(text).toBe(page);
	});

	it("ignores a heading inside a fenced block", () => {
		const fenced = ["# Views", "", "```yaml", "## Generating a base", "```", ""].join("\n");
		expect(place(fenced, "032", "generating-a-base").placed).toBeNull();
	});
});
