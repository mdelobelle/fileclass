import { describe, expect, it } from "vitest";

import { parseTemplate, renderTemplate } from "../../src/fields/inputTemplate";

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
