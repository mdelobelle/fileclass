import { describe, expect, it } from "vitest";

import { strayFrontmatter } from "../../src/schema/strayFrontmatter";

const block = "---\nfileClass: Person\nbirthDate: \"\"\ngroups: []\n---\n\n# Notes\n";

describe("strayFrontmatter", () => {
	it("finds the block a single character pushed out of position", () => {
		// The reported template, byte for byte: one backtick, then what should have been frontmatter.
		expect(strayFrontmatter("`\n" + block)).toEqual({
			line: 2,
			keys: ["fileClass", "birthDate", "groups"],
			precededBy: "`",
		});
	});

	it("finds it under blank lines, which are just as invisible", () => {
		expect(strayFrontmatter("\n\n\n" + block)?.line).toBe(4);
	});

	it("says nothing about real frontmatter", () => {
		expect(strayFrontmatter(block)).toBeNull();
	});

	it("says nothing about a file with no block at all", () => {
		expect(strayFrontmatter("# A note\n\nSome prose.\n")).toBeNull();
	});

	it("leaves a horizontal rule alone", () => {
		// `---` under a paragraph, with prose below: a rule, not properties.
		expect(strayFrontmatter("Some prose.\n\n---\n\nMore prose, not a key in sight.\n")).toBeNull();
	});

	it("leaves a rule alone even when a line under it reads like a key", () => {
		expect(strayFrontmatter("Intro.\n\n---\n\nNote: this is a sentence, not YAML.\nAnd this is prose.\n")).toBeNull();
	});

	it("ignores a block that never closes", () => {
		expect(strayFrontmatter("`\n---\nfileClass: Person\n")).toBeNull();
	});

	it("ignores a block too far down to be displaced frontmatter", () => {
		const prose = "line\n".repeat(12);
		expect(strayFrontmatter(prose + block)).toBeNull();
	});

	it("keeps list items and indented values inside the block", () => {
		const nested = "`\n---\norganizations:\n  - \"[[OVH]]\"\ngroups:\n  - Professionnal\n---\n";
		expect(strayFrontmatter(nested)?.keys).toEqual(["organizations", "groups"]);
	});

	it("shortens what precedes it, since a Notice has to fit", () => {
		const long = "x".repeat(80);
		expect(strayFrontmatter(long + "\n" + block)?.precededBy).toHaveLength(40);
	});
});
