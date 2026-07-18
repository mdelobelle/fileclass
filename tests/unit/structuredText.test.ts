import { describe, expect, it } from "vitest";

import { parseStructured, serializeStructured, YamlCodec } from "../../src/fields/structuredText";

// The JSON branch never touches the codec; give it a throwing stub to prove so.
const noYaml: YamlCodec = {
	parse: () => {
		throw new Error("codec must not be called");
	},
	stringify: () => {
		throw new Error("codec must not be called");
	},
};

describe("serializeStructured", () => {
	it("pretty-prints JSON with 2-space indent", () => {
		expect(serializeStructured("JSON", { a: 1, b: [2, 3] }, noYaml)).toBe(
			'{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}'
		);
	});
	it("returns empty text for empty values", () => {
		expect(serializeStructured("JSON", undefined, noYaml)).toBe("");
		expect(serializeStructured("JSON", null, noYaml)).toBe("");
		expect(serializeStructured("JSON", "", noYaml)).toBe("");
	});
	it("uses the injected codec for YAML and trims trailing newlines", () => {
		const yaml: YamlCodec = { parse: () => ({}), stringify: () => "a: 1\n\n" };
		expect(serializeStructured("YAML", { a: 1 }, yaml)).toBe("a: 1");
	});
});

describe("parseStructured", () => {
	it("parses JSON to a value", () => {
		expect(parseStructured("JSON", '{ "a": 1 }', noYaml)).toEqual({ ok: true, value: { a: 1 } });
	});
	it("clears the field on empty/whitespace text", () => {
		expect(parseStructured("JSON", "   ", noYaml)).toEqual({ ok: true, value: undefined });
		expect(parseStructured("YAML", "", noYaml)).toEqual({ ok: true, value: undefined });
	});
	it("reports invalid JSON without throwing", () => {
		const r = parseStructured("JSON", "{ bad", noYaml);
		expect(r.ok).toBe(false);
		expect(r.message).toMatch(/^Invalid JSON:/);
	});
	it("uses the injected codec for YAML", () => {
		const yaml: YamlCodec = { parse: (t) => ({ parsed: t }), stringify: () => "" };
		expect(parseStructured("YAML", "hello", yaml)).toEqual({ ok: true, value: { parsed: "hello" } });
	});
	it("surfaces codec errors as an Invalid YAML message", () => {
		const yaml: YamlCodec = {
			parse: () => {
				throw new Error("boom");
			},
			stringify: () => "",
		};
		const r = parseStructured("YAML", "x: [", yaml);
		expect(r.ok).toBe(false);
		expect(r.message).toBe("Invalid YAML: boom");
	});
});
