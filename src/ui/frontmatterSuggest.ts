/*
 * The field's values, offered where the value is actually typed (#185).
 *
 * Every other surface of this plugin asks the schema what a field may hold — the pickers, the
 * table, the note-fields modal. The **editor** did not: in source mode a frontmatter value is
 * ordinary text, so the fastest path through a note (Templater's cursor jumps, one hand, never
 * leaving the buffer) was also the only one where a typo became a value nobody checked.
 *
 * Offered for `Select`, `Cycle` and `Multi` — the types whose values are a list to choose from.
 * Read from Metadata Menu's own suggester, which gates on exactly those three: for an Input, a
 * Number or a Date there is no list to offer, and *Manage field at the cursor* is the command for
 * those.
 *
 * This adds the trigger and the list; the write goes through `processFrontMatter` like every other
 * write in the plugin, so quoting, list syntax and the frontmatter's shape stay Obsidian's problem
 * rather than a string this file assembles.
 */
import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { Field } from "../schema/field";
import { hasAllowedValues } from "../fields/validate";
import { resolveFieldValues } from "../fields/valuesIo";
import { readFieldValue } from "../io/read";
import {
	CaretValue,
	frontmatterValueAt,
	inlineListToBlock,
	unquote,
	yamlScalar,
} from "../io/frontmatterCaret";

/** A candidate, with everything selecting it needs to write it. */
interface ValueSuggestion {
	value: string;
	field: Field;
	caret: CaretValue;
	file: TFile;
}

export class FrontmatterValueSuggest extends EditorSuggest<ValueSuggestion> {
	/** Resolved once per open popover: a values-from-base list is a query, not a lookup. */
	private pending?: { key: string; values: Promise<string[]> };

	constructor(private readonly plugin: FileclassPlugin) {
		super(plugin.app);
	}

	/**
	 * Fires only where a value is being typed in a **frontmatter** key that a class declares with
	 * allowed values.
	 *
	 * Everything else is somebody else's line: the body, the key half of a pair, a note with no
	 * class, a field whose values are free text. A suggester that opens in the wrong place is worse
	 * than one that stays shut.
	 */
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		if (!file || !this.plugin.settings.enableFrontmatterSuggest) return null;
		const lines = editor.getValue().split("\n");
		const caret = frontmatterValueAt(lines, cursor.line, cursor.ch);
		if (!caret) return null;
		const field = this.fieldFor(file, caret.key);
		if (!field) return null;
		// A list's items are suggested one at a time; a single-valued field only on its own line.
		if (caret.list && !field.type.startsWith("Multi")) return null;
		return {
			start: { line: cursor.line, ch: caret.from },
			end: { line: cursor.line, ch: caret.to },
			query: JSON.stringify({ caret, path: file.path }),
		};
	}

	async getSuggestions(context: EditorSuggestContext): Promise<ValueSuggestion[]> {
		const parsed = JSON.parse(context.query) as { caret: CaretValue; path: string };
		const file = this.plugin.app.vault.getFileByPath(parsed.path);
		if (!(file instanceof TFile)) return [];
		const field = this.fieldFor(file, parsed.caret.key);
		if (!field) return [];
		const values = await this.valuesFor(field, file);
		const query = unquote(parsed.caret.query).toLowerCase();
		// On a list, what is already in it is not a candidate: offering it again is offering a
		// duplicate, which is what Metadata Menu's own suggester filtered out too. The item being
		// typed is not counted against itself.
		const taken = parsed.caret.list ? this.itemsAlreadyIn(field, file, unquote(parsed.caret.query)) : new Set<string>();
		return values
			.filter((v) => !taken.has(v))
			.filter((v) => !query || v.toLowerCase().includes(query))
			.map((value) => ({ value, field, caret: parsed.caret, file }));
	}

	renderSuggestion(suggestion: ValueSuggestion, el: HTMLElement): void {
		el.createSpan({ text: suggestion.value });
	}

	/**
	 * Writes the chosen value **through the editor**, and only here.
	 *
	 * Everywhere else this plugin writes with `processFrontMatter`, and that was tried first:
	 * measured, it loses. While a note is open with unsaved keystrokes — which is exactly the
	 * moment a suggester fires — the editor is the document. `processFrontMatter` reads the file
	 * from disk, writes it back, and the buffer is flushed over it a moment later: the chosen value
	 * disappeared, and clearing the typed text first only made the field end up empty.
	 *
	 * So on this one surface the value goes in the way the reader's own keystrokes do. What that
	 * costs is the quoting `processFrontMatter` would have done, which `yamlScalar` does — and what
	 * it buys is a value that is actually there.
	 */
	selectSuggestion(suggestion: ValueSuggestion): void {
		const ctx = this.context;
		if (!ctx) return;
		const { caret, value } = suggestion;
		const line = ctx.start.line;
		const lineText = ctx.editor.getLine(line);
		// An inline list becomes the block list every other surface writes: the `[]` goes, and the
		// value arrives on a line of its own (see inlineListToBlock).
		const block = caret.inline ? inlineListToBlock(lineText, value, unquote(caret.query)) : null;
		if (block) {
			const text = block.join("\n");
			ctx.editor.replaceRange(text, { line, ch: 0 }, { line, ch: lineText.length });
			const last = line + block.length - 1;
			ctx.editor.setCursor({ line: last, ch: block[block.length - 1].length });
			this.close();
			return;
		}
		const text = yamlScalar(value);
		ctx.editor.replaceRange(text, { line, ch: caret.from }, { line, ch: caret.to });
		ctx.editor.setCursor({ line, ch: caret.from + text.length });
		this.close();
	}

	/** The field a frontmatter key names, when the note's classes declare one with allowed values. */
	private fieldFor(file: TFile, key: string): Field | undefined {
		return this.plugin.index
			.getFields(file)
			.find((f) => f.name === key && !f.path && hasAllowedValues(f.type));
	}

	/** The values the note already carries for a list field, minus the one being typed. */
	private itemsAlreadyIn(field: Field, file: TFile, typed: string): Set<string> {
		const current = readFieldValue(this.plugin.app, file, field);
		const items = Array.isArray(current) ? current : current == null ? [] : [current];
		return new Set(items.filter((v): v is string => typeof v === "string").filter((v) => v !== typed));
	}

	/** The field's candidates, memoised for as long as the popover is about the same key. */
	private valuesFor(field: Field, file: TFile): Promise<string[]> {
		const key = `${file.path}:${field.name}`;
		if (this.pending?.key !== key) {
			this.pending = { key, values: resolveFieldValues(this.plugin, field, file).catch(() => []) };
		}
		return this.pending.values;
	}
}
