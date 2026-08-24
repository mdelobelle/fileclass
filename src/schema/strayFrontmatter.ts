/*
 * A block of properties that is not frontmatter, because something precedes it.
 *
 * Obsidian reads a `---` block as frontmatter **only at position 0**. One stray character above it
 * — a backtick left in a template, a blank line, a heading — and the block becomes body text that
 * still looks exactly like properties. Nothing says so: the note simply has no properties.
 *
 * Reported on a production vault (24 August 2026), where a class template began with a lone
 * backtick. Creating a note applied the template, `processFrontMatter` found no frontmatter to
 * merge into, wrote a block of its own, and every new note carried its properties twice — the real
 * ones on top, the template's inert underneath. The template's values were lost in the bargain,
 * since a block nobody parses has no values to keep.
 *
 * This detects the shape so a caller can say it out loud. It never repairs: what the author meant
 * is theirs to decide, and a template is a file they wrote.
 */

/** A `---` block of YAML-looking keys that sits somewhere other than the top of the file. */
export interface StrayFrontmatter {
	/** 1-based line of the block's opening `---`. */
	line: number;
	/** The top-level keys it declares, in order. */
	keys: string[];
	/** What precedes it, trimmed and shortened — the thing to remove. */
	precededBy: string;
}

/** How far down the file a displaced block can start and still be a displaced *frontmatter*. */
const SEARCH_LINES = 10;

const OPENER = /^---\s*$/;
/** `key:`, `key: value` — a top-level YAML key. */
const KEY = /^([A-Za-z_][\w .-]*):(\s|$)/;
/** A list item or an indented continuation of the key above it. */
const CONTINUATION = /^(\s+\S|-\s|\s*#)/;

/**
 * The displaced block, or null when the text is fine — which includes the ordinary cases: proper
 * frontmatter at line 1, no `---` at all, and a `---` used as a horizontal rule with prose under it.
 *
 * Conservative on purpose. A false warning about a file the author wrote deliberately is worse than
 * a missed one: the block must open and close, hold at least one top-level key, and hold nothing
 * that is not a key, a list item, an indented line or a blank.
 */
export function strayFrontmatter(text: string): StrayFrontmatter | null {
	if (text.startsWith("---")) return null; // real frontmatter, or nothing we can improve on
	const lines = text.split("\n");
	for (let i = 0; i < Math.min(lines.length, SEARCH_LINES); i++) {
		if (!OPENER.test(lines[i])) continue;
		const keys: string[] = [];
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j];
			if (OPENER.test(line)) {
				if (!keys.length) return null;
				const before = lines.slice(0, i).join("\n").trim();
				return { line: i + 1, keys, precededBy: before.slice(0, 40) };
			}
			const key = KEY.exec(line);
			if (key) keys.push(key[1]);
			else if (line.trim() !== "" && !CONTINUATION.test(line)) return null; // prose: a rule, not properties
		}
		return null; // never closed
	}
	return null;
}
