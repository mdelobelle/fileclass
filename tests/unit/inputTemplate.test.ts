import { describe, expect, it } from "vitest";

import { matchTemplate, parseTemplate, renderTemplate } from "../../src/fields/inputTemplate";

describe("parseTemplate", () => {
	it("returns no parts for a plain string", () => {
		expect(parseTemplate("just text")).toEqual([]);
		expect(parseTemplate("")).toEqual([]);
	});

	it("reads free-text placeholders in first-appearance order", () => {
		expect(parseTemplate("https://github.com/{{user}}/{{repo}}/")).toEqual([
			{ name: "user" },
			{ name: "repo" },
		]);
	});

	it("reads a dropdown placeholder from a JSON array", () => {
		expect(parseTemplate('{{price}} {{unit:["gp","cp"]}}')).toEqual([
			{ name: "price" },
			{ name: "unit", choices: ["gp", "cp"] },
		]);
	});

	it("coerces non-string choices to strings", () => {
		expect(parseTemplate("{{n:[1,2,3]}}")).toEqual([{ name: "n", choices: ["1", "2", "3"] }]);
	});

	it("de-duplicates a repeated placeholder name", () => {
		expect(parseTemplate("{{x}}-{{x}}-{{y}}")).toEqual([{ name: "x" }, { name: "y" }]);
	});

	it("trims whitespace around names", () => {
		expect(parseTemplate("{{ name }}")).toEqual([{ name: "name" }]);
	});

	it("ignores empty placeholder names", () => {
		expect(parseTemplate("a{{}}b")).toEqual([]);
	});

	it("flags invalid choices JSON without throwing, falling back to free text", () => {
		const parts = parseTemplate("{{u:[not json}}");
		expect(parts).toHaveLength(1);
		expect(parts[0].name).toBe("u");
		expect(parts[0].choices).toBeUndefined();
		expect(parts[0].choicesError).toBeTruthy();
	});

	it("flags a non-array JSON payload as an error", () => {
		const parts = parseTemplate('{{u:"x"}}');
		expect(parts[0]).toMatchObject({ name: "u", choicesError: "choices must be a JSON array" });
	});
});

describe("renderTemplate", () => {
	it("substitutes placeholders with their values", () => {
		expect(
			renderTemplate("https://github.com/{{user}}/{{repo}}/", { user: "ovh", repo: "fileclass" })
		).toBe("https://github.com/ovh/fileclass/");
	});

	it("substitutes dropdown placeholders ignoring their choice spec", () => {
		expect(renderTemplate('{{price}} {{unit:["gp","cp"]}}', { price: "5", unit: "gp" })).toBe(
			"5 gp"
		);
	});

	it("renders missing or empty values as an empty string", () => {
		expect(renderTemplate("pg. {{page}}", {})).toBe("pg. ");
		expect(renderTemplate("pg. {{page}}", { page: "" })).toBe("pg. ");
	});

	it("replaces every occurrence of a repeated placeholder", () => {
		expect(renderTemplate("{{x}}/{{x}}", { x: "a" })).toBe("a/a");
	});

	it("collapses newlines to a comma so the value stays a scalar", () => {
		expect(renderTemplate("{{a}}\n{{b}}", { a: "1", b: "2" })).toBe("1, 2");
	});
});

describe("matchTemplate — reading a stored value back into its parts", () => {
	it("recovers each part when separators make it unambiguous", () => {
		expect(matchTemplate("{{room}} · {{unit}}-{{level}}", "Study · A-3")).toEqual({
			room: "Study",
			unit: "A",
			level: "3",
		});
	});

	it("is what keeps an edit of one part from wiping the others", () => {
		// The regression: controls started blank, so changing `level` re-rendered
		// "{{room}} · {{unit}}-{{level}}" from empty parts and stored " · -4".
		const stored = matchTemplate("{{room}} · {{unit}}-{{level}}", "Study · A-3");
		expect(renderTemplate("{{room}} · {{unit}}-{{level}}", { ...stored, level: "4" })).toBe(
			"Study · A-4"
		);
	});

	it("matches a dropdown part against its own choices, not any text", () => {
		const template = '{{room:["Study","Living room"]}}/{{shelf}}';
		expect(matchTemplate(template, "Living room/B-2")).toEqual({ room: "Living room", shelf: "B-2" });
		expect(matchTemplate(template, "Cellar/B-2")).toBeNull(); // not an offered choice
	});

	it("handles a name that recurs, one control driving both", () => {
		expect(matchTemplate("{{code}}-{{code}}", "AA-AA")).toEqual({ code: "AA" });
		expect(matchTemplate("{{code}}-{{code}}", "AA-BB")).toBeNull();
	});

	it("escapes regex metacharacters in the literal parts", () => {
		expect(matchTemplate("({{a}}) [{{b}}]", "(x) [y]")).toEqual({ a: "x", b: "y" });
	});

	it("returns null on a value that doesn't fit, so the form falls back to empty", () => {
		expect(matchTemplate("{{room}} · {{unit}}", "typed by hand")).toBeNull();
		expect(matchTemplate("{{room}} · {{unit}}", "")).toBeNull();
	});

	it("treats a whitespace-named placeholder as nothing, and an empty one as literal", () => {
		// `{{ }}` has a (blank) name, so it renders as "" and matches "".
		expect(matchTemplate("{{ }}{{room}}", "Study")).toEqual({ room: "Study" });
		// `{{}}` isn't a placeholder at all — the parser needs at least one character
		// — so it stays literal on both sides. Checked against renderTemplate rather
		// than assumed.
		expect(renderTemplate("{{}}{{room}}", { room: "Study" })).toBe("{{}}Study");
		expect(matchTemplate("{{}}{{room}}", "{{}}Study")).toEqual({ room: "Study" });
	});
});
