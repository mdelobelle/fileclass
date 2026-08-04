import { describe, expect, it } from "vitest";

import {
	convertNotation,
	parseStructured,
	serializeStructured,
	YamlCodec,
} from "../../src/fields/structuredText";

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
	it("gives back a JSON field's stored text as it stands", () => {
		expect(serializeStructured("JSON", '{ "a": 1 }', noYaml)).toBe('{ "a": 1 }');
	});
	it("prints a structure when a JSON field holds one (from before, or another tool)", () => {
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
	it("stores a JSON field's own text, checked but not converted", () => {
		// The type stores the text so Obsidian writes it as a block scalar and the
		// operator's formatting survives; parsing is the check, not the value.
		expect(parseStructured("JSON", '{ "a": 1 }', noYaml)).toEqual({
			ok: true,
			value: '{ "a": 1 }',
		});
		expect(parseStructured("JSON", '{\n  "a": 1\n}', noYaml)).toEqual({
			ok: true,
			value: '{\n  "a": 1\n}',
		});
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

describe("convertNotation — the other notation, when it applies", () => {
	const yaml: YamlCodec = {
		// Enough of a YAML reader for these cases: `a: 1` and JSON both parse.
		parse: (t) => {
			const trimmed = t.trim();
			if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
			const out: Record<string, string> = {};
			for (const line of trimmed.split("\n")) {
				const i = line.indexOf(":");
				if (i === -1) throw new Error("not yaml");
				out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
			}
			return out;
		},
		stringify: (v) =>
			Object.entries(v as Record<string, unknown>)
				.map(([k, val]) => `${k}: ${String(val)}`)
				.join("\n") + "\n",
	};

	it("offers JSON for a JSON field holding YAML", () => {
		expect(convertNotation("JSON", "producer: Teo\nengineer: Fred", yaml)).toBe(
			'{\n  "producer": "Teo",\n  "engineer": "Fred"\n}'
		);
	});

	it("offers YAML for a YAML field holding JSON", () => {
		expect(convertNotation("YAML", '{"producer": "Teo"}', yaml)).toBe("producer: Teo");
	});

	it("offers nothing when the text is already what the field wants", () => {
		expect(convertNotation("JSON", '{"a": 1}', yaml)).toBeNull();
		expect(convertNotation("YAML", "a: 1", yaml)).toBeNull();
	});

	it("offers nothing for text that parses as neither, or for a scalar", () => {
		expect(convertNotation("JSON", "{ bad", yaml)).toBeNull();
		expect(convertNotation("YAML", "42", yaml)).toBeNull();
		expect(convertNotation("JSON", "   ", yaml)).toBeNull();
	});
});
