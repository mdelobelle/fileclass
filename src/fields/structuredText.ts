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

/** Serializes a stored value to editable text (empty when there is none). */
export function serializeStructured(
	type: StructuredType,
	value: unknown,
	yaml: YamlCodec
): string {
	if (value === undefined || value === null || value === "") return "";
	if (type === "JSON") return JSON.stringify(value, null, 2);
	return yaml.stringify(value).replace(/\n+$/, "");
}

export interface StructuredParse {
	ok: boolean;
	value?: unknown;
	message?: string;
}

/** Parses editable text back to a value; empty text clears the field. */
export function parseStructured(
	type: StructuredType,
	text: string,
	yaml: YamlCodec
): StructuredParse {
	const trimmed = text.trim();
	if (trimmed === "") return { ok: true, value: undefined };
	try {
		const value: unknown = type === "JSON" ? JSON.parse(trimmed) : yaml.parse(trimmed);
		return { ok: true, value };
	} catch (err) {
		return { ok: false, message: `Invalid ${type}: ${(err as Error).message}` };
	}
}
