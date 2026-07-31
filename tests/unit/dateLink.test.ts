/*
 * The wikilink form of a date value: a folder that follows the date, and an alias
 * so the link reads as the date rather than its path. The moment formatting is
 * injected, so these are real assertions on the string that lands in frontmatter.
 */
import { describe, expect, it } from "vitest";

import { buildDateLink, expandLinkPath } from "../../src/fields/dateLink";

/** Stand-in for Obsidian's moment: enough tokens for the paths people write. */
const fmt = (iso: string, format: string): string => {
	const [y, m, d] = iso.split("-");
	const table: Record<string, string> = {
		YYYY: y,
		YY: y.slice(2),
		MM: m,
		DD: d,
		"YYYY-MM": `${y}-${m}`,
	};
	return table[format] ?? "";
};

describe("expandLinkPath", () => {
	it("leaves literal text alone", () => {
		expect(expandLinkPath("Daily/Notes/", "2026-07-30", fmt)).toBe("Daily/Notes/");
	});

	it("expands braced tokens only", () => {
		// "Daily" survives: a raw moment format would have eaten its D and a.
		expect(expandLinkPath("Daily/Notes/{{YYYY}}/{{MM}}/", "2026-07-30", fmt)).toBe(
			"Daily/Notes/2026/07/"
		);
	});

	it("tolerates spaces inside the braces", () => {
		expect(expandLinkPath("J/{{ YYYY }}/", "2026-07-30", fmt)).toBe("J/2026/");
	});

	it("drops a token moment can't format", () => {
		expect(expandLinkPath("J/{{nonsense}}/", "2026-07-30", fmt)).toBe("J//");
	});
});

describe("buildDateLink", () => {
	const iso = "2026-07-30";

	it("wraps a bare date when there is no path", () => {
		expect(buildDateLink(iso, iso, {}, fmt)).toBe("[[2026-07-30]]");
	});

	it("adds the missing trailing slash", () => {
		expect(buildDateLink(iso, iso, { linkPath: "Journal" }, fmt)).toBe("[[Journal/2026-07-30]]");
	});

	it("builds the daily-note form, alias included", () => {
		expect(
			buildDateLink("2026-07-30 Thu", iso, {
				linkPath: "Daily/Notes/{{YYYY}}/{{MM}}/",
				alias: true,
			}, fmt)
		).toBe("[[Daily/Notes/2026/07/2026-07-30 Thu|2026-07-30 Thu]]");
	});

	it("keeps the stored date's own format in both halves of the link", () => {
		// The date is already formatted by the field; the ISO only feeds the path.
		expect(buildDateLink("30/07/2026", iso, { linkPath: "{{YYYY}}/", alias: true }, fmt)).toBe(
			"[[2026/30/07/2026|30/07/2026]]"
		);
	});

	it("skips a pointless alias when the link is just the date", () => {
		expect(buildDateLink(iso, iso, { alias: true }, fmt)).toBe("[[2026-07-30]]");
	});

	it("never points outside the vault root", () => {
		expect(buildDateLink(iso, iso, { linkPath: "/Journal/" }, fmt)).toBe("[[Journal/2026-07-30]]");
	});
});
