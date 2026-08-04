/*
 * Pure serialize/parse for the free-form structured types JSON and YAML
 * (ARCHITECTURE.md §7). No Obsidian import: the YAML codec is injected so this
 * stays unit-testable (fieldActions passes Obsidian's parseYaml/stringifyYaml).
 *
 * Unlike Object/ObjectList (which have a child schema), these store an
 * arbitrary nested value edited as raw text and validated by the parser.
 */

/** A YAML parse/stringify pair (Obsidian's, or a stub in tests). */
export interface YamlCodec {
	parse: (text: string) => unknown;
	stringify: (value: unknown) => string;
}

export type StructuredType = "JSON" | "YAML";

/**
 * What each type stores, which is the whole difference between them:
 *
 * - **YAML** stores the *parsed structure*. Frontmatter is YAML, so the value lands as
 *   real keys and lists — which is what lets a base reach inside it through a formula.
 * - **JSON** stores the *text*, verbatim, which Obsidian writes as a block scalar
 *   (`tech: |-`). Measured: a multi-line string is emitted as a block, a hand-authored
 *   one survives a write elsewhere in the note untouched, and the cache gives the exact
 *   text back. So a payload pasted from an API keeps its own formatting, at the price of
 *   being opaque to Bases — a string, not a structure.
 *
 * That asymmetry is deliberate: storing JSON as a YAML mapping (what this did before)
 * meant the type was a notation for the editor only, and nothing on disk was JSON.
 */

/** Serializes a stored value to editable text (empty when there is none). */
export function serializeStructured(
	type: StructuredType,
	value: unknown,
	yaml: YamlCodec
): string {
	if (value === undefined || value === null || value === "") return "";
	// A JSON field holds its own text. A value written before this — or by another tool —
	// may still be a structure, so it is printed rather than refused.
	if (type === "JSON") {
		return typeof value === "string" ? value : JSON.stringify(value, null, 2);
	}
	return yaml.stringify(value).replace(/\n+$/, "");
}

export interface StructuredParse {
	ok: boolean;
	value?: unknown;
	message?: string;
}

/**
 * Parses editable text into the value to store; empty text clears the field.
 *
 * The parse is a check, not a conversion, for `JSON`: the text is what gets stored, so
 * the operator's own formatting survives. For `YAML` the parsed structure is the value.
 */
export function parseStructured(
	type: StructuredType,
	text: string,
	yaml: YamlCodec
): StructuredParse {
	const trimmed = text.trim();
	if (trimmed === "") return { ok: true, value: undefined };
	try {
		if (type === "JSON") {
			JSON.parse(trimmed);
			return { ok: true, value: trimmed };
		}
		return { ok: true, value: yaml.parse(trimmed) };
	} catch (err) {
		return { ok: false, message: `Invalid ${type}: ${(err as Error).message}` };
	}
}

/**
 * The same value in the other notation, when the text is readable as it: a `JSON` field
 * holding YAML, or a `YAML` field holding JSON. Returns null when there is nothing to
 * offer — the text already parses as its own type, or parses as neither.
 *
 * This is what replaces "switch the type and watch the notation change": now that each
 * type stores something different, switching a field's type leaves the old notation in
 * place, and converting it is an explicit act with a button of its own.
 */
export function convertNotation(
	type: StructuredType,
	text: string,
	yaml: YamlCodec
): string | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	const parses = (fn: () => unknown): unknown => {
		try {
			return fn();
		} catch {
			return undefined;
		}
	};
	if (type === "JSON") {
		if (parses(() => JSON.parse(trimmed)) !== undefined) return null; // already JSON
		const asYaml = parses(() => yaml.parse(trimmed));
		if (asYaml === undefined || typeof asYaml !== "object" || asYaml === null) return null;
		return JSON.stringify(asYaml, null, 2);
	}
	const asJson = parses(() => JSON.parse(trimmed));
	if (asJson === undefined || typeof asJson !== "object" || asJson === null) return null;
	// YAML reads JSON too, so "already YAML" can't be the test — what matters is that the
	// text *is* JSON, and a YAML field would rather hold YAML.
	return yaml.stringify(asJson).replace(/\n+$/, "");
}
