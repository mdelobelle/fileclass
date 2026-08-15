/*
 * Where the caret is, in a note's frontmatter (pure, #185).
 *
 * The editor is the one surface where a value can be entered without the schema seeing it: no
 * candidate list, no validation, no constraint to the allowed set. Offering the field's values
 * there means answering one question first — **which field is this caret in?** — and that question
 * is text, not Obsidian: given the lines of a file and a cursor, which key does the value being
 * typed belong to, and what has been typed so far.
 *
 * Kept deliberately small. It does not parse YAML: it recognises the two shapes a value is written
 * in (`key: value` and a `- item` under a key) and refuses everything else, because a suggester that
 * fires in the wrong place is worse than one that does not fire.
 */

/** What the caret is editing: the key, what has been typed, and the range to replace. */
export interface CaretValue {
	key: string;
	/** The text between the start of the value and the caret. */
	query: string;
	/** Column where the value starts, and where it ends (end of line). */
	from: number;
	to: number;
	/** The caret is on a `- item` line of a list under `key`. */
	list: boolean;
	/** …or inside an inline list, `themes: [Ecology, Rel]`, which is written back in that form. */
	inline?: boolean;
	/**
	 * Whether anything separates the marker from the value.
	 *
	 * `Status:OnGoing` is not a key and a value — it is the scalar string `Status:OnGoing`, and the
	 * same goes for `-Ecology` in a list. A reader who starts typing right after the colon is one
	 * keystroke away from a note whose frontmatter no longer parses, so what is written back has to
	 * put that space in.
	 */
	spaced: boolean;
}

/** A key line: indentation, key, then whatever follows the colon. */
const KEY_LINE = /^(\s*)([A-Za-z0-9_][^:#]*?)\s*:(\s*)(.*)$/;
/** A list item line: indentation, dash, then the item. */
const ITEM_LINE = /^(\s*)-(\s*)(.*)$/;

/** The line index closing the frontmatter block, or -1 when the file has none. */
export function frontmatterEnd(lines: readonly string[]): number {
	if (lines[0]?.trim() !== "---") return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") return i;
	}
	return -1;
}

/**
 * The value the caret sits in, or null.
 *
 * Null on purpose for: a file with no frontmatter, a caret outside the block or on its fences, a
 * caret in the **key** rather than the value, a comment, and an inline list (`tags: [a, b]`) —
 * which is one value written as several and would need a parser to split at the caret.
 */
export function frontmatterValueAt(
	lines: readonly string[],
	line: number,
	ch: number
): CaretValue | null {
	const end = frontmatterEnd(lines);
	if (end < 0 || line <= 0 || line >= end) return null;
	const text = lines[line] ?? "";
	if (text.trimStart().startsWith("#")) return null;

	const key = KEY_LINE.exec(text);
	if (key) {
		const [, indent, name, gap, value] = key;
		const from = indent.length + name.length + 1 + gap.length;
		// In the key, or on the colon: nothing to suggest, and suggesting a value there would
		// replace the key with it.
		if (ch < from) return null;
		if (value.startsWith("{")) return null;
		// An inline list is a list written on one line — the notation the reader chose, and the one
		// they get back. What is being typed is the item between the caret and the separator before
		// it; everything else on the line stays exactly as it is.
		if (value.startsWith("[")) return inlineItemAt(name.trim(), text, from, ch);
		return {
			key: name.trim(),
			query: text.slice(from, ch),
			from,
			to: text.length,
			list: false,
			spaced: gap.length > 0,
		};
	}

	const item = ITEM_LINE.exec(text);
	if (!item) return null;
	const [, indent, gap] = item;
	const from = indent.length + 1 + gap.length;
	if (ch < from) return null;
	const owner = ownerKey(lines, line, indent.length, end);
	if (!owner) return null;
	return { key: owner, query: text.slice(from, ch), from, to: text.length, list: true, spaced: gap.length > 0 };
}

/**
 * The item of an inline list the caret is in, or null when it is outside the brackets.
 *
 * `themes: [Ecology, Rel|]` → the item is `Rel`, from just after the comma to just before the
 * closing bracket. A caret after the `]` is not in the list at all: typing there produces
 * `[]Rel`, which is not a value anybody meant, and suggesting into it would bless it.
 */
function inlineItemAt(key: string, text: string, valueFrom: number, ch: number): CaretValue | null {
	const open = text.indexOf("[", valueFrom);
	const close = text.indexOf("]", open);
	if (open < 0 || ch <= open) return null;
	if (close >= 0 && ch > close) return null;
	const end = close < 0 ? text.length : close;
	const before = text.slice(open + 1, ch);
	const comma = before.lastIndexOf(",");
	const itemStart = open + 1 + (comma >= 0 ? comma + 1 : 0);
	// The item ends at the next separator, so choosing replaces one item and not the rest.
	const after = text.slice(ch, end);
	const nextComma = after.indexOf(",");
	const itemEnd = nextComma >= 0 ? ch + nextComma : end;
	const lead = text.slice(itemStart, ch).match(/^\s*/)?.[0].length ?? 0;
	return {
		key,
		query: text.slice(itemStart + lead, ch),
		from: itemStart + lead,
		to: itemEnd,
		list: true,
		inline: true,
		// Inside brackets a value needs no separator of its own; the comma or the bracket is one.
		spaced: true,
	};
}

/**
 * The key a list item belongs to: the nearest key line above it, indented no further.
 *
 * Walking up rather than parsing lets this answer inside a nested block without knowing what the
 * block is — and stops at the fence, so a list at the top of a file cannot borrow a key from
 * outside the frontmatter.
 */
function ownerKey(lines: readonly string[], from: number, indent: number, end: number): string | null {
	for (let i = from - 1; i > 0 && i < end; i--) {
		const text = lines[i] ?? "";
		if (!text.trim()) continue;
		const item = ITEM_LINE.exec(text);
		if (item && item[1].length >= indent) continue; // a sibling item
		const key = KEY_LINE.exec(text);
		if (!key) return null;
		if (key[1].length <= indent) return key[2].trim();
	}
	return null;
}

/**
 * Which field the caret is in, as the chain of keys leading to it.
 *
 * A frontmatter is a tree, and a field can be three levels into it: `editions` is a list of
 * objects, each with a `year`, so a caret on `year: 1990` is not "the year field" — it is *this
 * item's* year, in that list. What a command can act on is the **root** of that chain — the field
 * the class declares at the top level — plus which item of it, which is what this returns.
 *
 * `keys[0]` is a root key; `itemIndex` is the position in the nearest list enclosing the caret.
 */
export interface CaretPath {
	keys: string[];
	itemIndex?: number;
}

/** `- key: value` — the first line of an object item, which is an item *and* a key. */
const OBJECT_ITEM = /^(\s*)-(\s+)([A-Za-z0-9_][^:#]*?)\s*:/;

export function frontmatterPathAt(lines: readonly string[], line: number, ch: number): CaretPath | null {
	const end = frontmatterEnd(lines);
	if (end < 0 || line <= 0 || line >= end) return null;
	const text = lines[line] ?? "";
	if (!text.trim() || text.trimStart().startsWith("#")) return null;

	const keys: string[] = [];
	let itemIndex: number | undefined;
	// The indent a parent has to beat. It falls as the walk goes up, so a sibling can never be
	// mistaken for a parent.
	let needIndent: number;

	const objectItem = OBJECT_ITEM.exec(text);
	const keyLine = KEY_LINE.exec(text);
	const scalarItem = ITEM_LINE.exec(text);

	if (objectItem) {
		const [, indent, , name] = objectItem;
		keys.push(name.trim());
		itemIndex = countItems(lines, line, indent.length, end);
		needIndent = indent.length;
	} else if (keyLine) {
		const [, indent, name] = keyLine;
		keys.push(name.trim());
		needIndent = indent.length;
	} else if (scalarItem) {
		// `- Ecology`: a value in a list, whose key is found by the walk below.
		const [, indent] = scalarItem;
		itemIndex = countItems(lines, line, indent.length, end);
		needIndent = indent.length;
	} else {
		return null;
	}
	void ch;

	for (let i = line - 1; i > 0 && needIndent > 0; i--) {
		const above = lines[i] ?? "";
		if (!above.trim()) continue;
		const item = OBJECT_ITEM.exec(above) ?? ITEM_LINE.exec(above);
		if (item && item[1].length < needIndent) {
			if (itemIndex === undefined) itemIndex = countItems(lines, i, item[1].length, end);
			needIndent = item[1].length;
			continue;
		}
		const key = KEY_LINE.exec(above);
		if (!key || key[1].length >= needIndent) continue;
		keys.unshift(key[2].trim());
		needIndent = key[1].length;
	}
	return keys.length ? { keys, itemIndex } : null;
}

/** How many list items at `indent` precede this one, under the same key. */
function countItems(lines: readonly string[], line: number, indent: number, end: number): number {
	let count = 0;
	for (let i = line - 1; i > 0 && i < end; i--) {
		const text = lines[i] ?? "";
		if (!text.trim()) continue;
		const item = ITEM_LINE.exec(text);
		if (item) {
			if (item[1].length === indent) count++;
			continue; // a deeper item belongs to this one; a shallower one is another list
		}
		const key = KEY_LINE.exec(text);
		// A key indented at least as far as the items is part of the item above; one indented less
		// is the list's own key, and the count stops there.
		if (key && key[1].length >= indent) continue;
		break;
	}
	return count;
}

/**
 * The line a chain of keys sits on — for putting the caret back after a write.
 *
 * Found by asking each line of the block what its own chain is, rather than by a second parser:
 * one description of the shape, read in both directions, so the two cannot disagree.
 */
export function lineOfPath(lines: readonly string[], path: CaretPath): number | null {
	const end = frontmatterEnd(lines);
	if (end < 0) return null;
	for (let i = 1; i < end; i++) {
		const here = frontmatterPathAt(lines, i, (lines[i] ?? "").length);
		if (!here) continue;
		if (here.keys.join("\u0000") !== path.keys.join("\u0000")) continue;
		if (path.itemIndex !== undefined && here.itemIndex !== path.itemIndex) continue;
		return i;
	}
	return null;
}

/**
 * A value as it must be written in YAML — quoted only when it would otherwise read as something
 * else.
 *
 * The frontmatter suggester types its value into the editor rather than going through
 * `processFrontMatter` (see frontmatterSuggest.ts for why), so the quoting that is normally
 * Obsidian's is this function's. Kept to the cases a *chosen* value can actually hit: a colon and
 * space, a leading indicator character, something that would parse as a number or a boolean when
 * it is a string, and the empty value.
 */
export function yamlScalar(value: string): string {
	if (value === "") return '""';
	const risky =
		/[:#]\s/.test(value) ||
		value.includes(": ") ||
		/^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
		/^(true|false|null|yes|no|on|off|~)$/i.test(value) ||
		/^[+-]?\d+(\.\d+)?$/.test(value) ||
		value !== value.trim() ||
		value.endsWith(":");
	if (!risky) return value;
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * An inline list, rewritten as the block list a chosen value lands in.
 *
 * `themes: []` + *Religion* becomes two lines — the `[]` goes, and the value is a line of its own:
 *
 * ```yaml
 * themes:
 *   - Religion
 * ```
 *
 * That is the form `processFrontMatter` produces, and this plugin writes lists that way everywhere
 * else; a suggester that left `[Religion]` behind would make the shape of a list depend on which
 * surface last touched it. Items already inline come along, in their order.
 *
 * `typed` is the partial item the caret was in: it is replaced rather than kept beside the value it
 * was being typed for. Returns null when the line holds no inline list.
 */
export function inlineListToBlock(lineText: string, chosen: string, typed: string): string[] | null {
	const key = KEY_LINE.exec(lineText);
	if (!key) return null;
	const [, indent, name, , value] = key;
	if (!value.startsWith("[")) return null;
	const close = value.lastIndexOf("]");
	const inner = value.slice(1, close < 0 ? undefined : close);
	const items = inner
		.split(",")
		.map((item) => unquote(item))
		.filter((item) => item !== "");
	const at = items.findIndex((item) => item === typed.trim());
	if (at >= 0) items[at] = chosen;
	else items.push(chosen);
	const childIndent = `${indent}  `;
	return [`${indent}${name.trim()}:`, ...items.map((item) => `${childIndent}- ${yamlScalar(item)}`)];
}

/** Strips the quotes a value may be written with, so `"Scie` queries as `Scie`. */
export function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 1 && (trimmed[0] === '"' || trimmed[0] === "'")) {
		const quote = trimmed[0];
		const inner = trimmed.slice(1);
		return inner.endsWith(quote) ? inner.slice(0, -1) : inner;
	}
	return trimmed;
}
