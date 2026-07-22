/*
 * Pure parser/renderer for the Input `template` option (#27, ARCHITECTURE §7.1).
 * Ported from Metadata Menu's Input template mechanism (semantics, not code). No
 * Obsidian import; fully unit-tested.
 *
 * A template is a literal string carrying `{{name}}` placeholders. A bare
 * placeholder is a free-text sub-input; `{{name:["a","b"]}}` (the part after the
 * first `:` being a JSON array) is a dropdown over those choices. The rendered
 * value stays a single frontmatter scalar — no computation, no Bases dependency.
 */

/** Fresh global matcher each call (a shared `/g` regex carries lastIndex state). */
function placeholderRe(): RegExp {
	return /\{\{([^}]+?)\}\}/gu;
}

/** Splits a placeholder body into its name and the raw options payload (after the first `:`). */
function splitNameOptions(body: string): [string, string | undefined] {
	const idx = body.indexOf(":");
	if (idx === -1) return [body.trim(), undefined];
	return [body.slice(0, idx).trim(), body.slice(idx + 1)];
}

function parseChoices(optionsString: string): { choices?: string[]; error?: string } {
	try {
		const parsed: unknown = JSON.parse(optionsString);
		if (!Array.isArray(parsed)) return { error: "choices must be a JSON array" };
		return { choices: parsed.map((c) => String(c)) };
	} catch (e) {
		return { error: (e as Error).message };
	}
}

export interface TemplatePart {
	/** Placeholder name; the key used to render this part. */
	name: string;
	/** Dropdown choices for `{{name:[...]}}`; undefined = free-text input. */
	choices?: string[];
	/** Set when a `:` payload was present but not a valid JSON array of choices. */
	choicesError?: string;
}

/**
 * Parses a template into its distinct placeholders, in first-appearance order.
 * A name that recurs in the template appears once (one control drives every
 * occurrence). Empty/whitespace-only names are ignored.
 */
export function parseTemplate(template: string): TemplatePart[] {
	const parts: TemplatePart[] = [];
	const seen = new Set<string>();
	for (const match of template.matchAll(placeholderRe())) {
		const [name, optionsString] = splitNameOptions(match[1]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		if (optionsString === undefined) {
			parts.push({ name });
			continue;
		}
		const { choices, error } = parseChoices(optionsString.trim());
		parts.push(error ? { name, choicesError: error } : { name, choices });
	}
	return parts;
}

/**
 * Renders a template by substituting every placeholder with its value (missing
 * or empty → ""). Newlines collapse to ", " so the result stays a single
 * frontmatter scalar (Metadata Menu parity).
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
	const out = template.replace(placeholderRe(), (_full, body: string) => {
		const [name] = splitNameOptions(body);
		return values[name] ?? "";
	});
	return out.replace(/\n/gu, ", ");
}
