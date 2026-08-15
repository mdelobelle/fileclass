/*
 * "Manage the field at the cursor" — the schema, reachable from the editor (#185).
 *
 * The suggester beside this one covers the types with a list to choose from: Select, Cycle, Multi.
 * Everything else — a Date, a Number, a Duration, an Object — has a controller rather than a list,
 * and no popover can stand in for it. This command is the way to that controller from where the
 * value is written: put the caret in a value, press the hotkey, and the field's own editor opens.
 *
 * Deliberately narrow, as Metadata Menu's equivalent was: a key the schema does not declare gets
 * **nothing**. Offering a generic text prompt there would make the command a second way to write
 * frontmatter, unchecked, which is the very thing this is meant to close.
 */
import { MarkdownView, Notice, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { EditContext, promptFieldValue, runControlAction } from "../fields/fieldActions";
import { ObjectListEditorModal } from "../fields/input/objectEditor";
import { makeDisplayDeps } from "../fields/displayDeps";
import { childFieldsOf, Field } from "../schema/field";
import { asListValue } from "../fields/objectDraft";
import { strayText } from "../fields/objectDisplay";
import { readFieldValue } from "../io/read";
import { CaretPath, frontmatterPathAt, lineOfPath } from "../io/frontmatterCaret";
import { writeFieldValue } from "../io/write";

export function manageFieldAtCursor(plugin: FileclassPlugin): void {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const editor = view?.editor;
	const file = view?.file;
	if (!editor || !file) {
		new Notice("Fileclass: open a note in the editor first.");
		return;
	}
	const cursor = editor.getCursor();
	const path = frontmatterPathAt(editor.getValue().split("\n"), cursor.line, cursor.ch);
	if (!path) {
		// Said rather than silent: a hotkey that does nothing is indistinguishable from one that
		// is not bound. In reading mode the frontmatter is a table, not text, and there is no caret
		// in it at all — which is the same answer.
		new Notice("Fileclass: the cursor is not on a frontmatter field.");
		return;
	}
	const fields = plugin.index.getFields(file);
	const root = fields.find((f) => !f.path && f.name === path.keys[0]);
	if (!root) {
		new Notice(`Fileclass: "${path.keys[0]}" is not a field of this note's class.`);
		return;
	}

	const ctx: EditContext = { host: plugin, file, allFields: fields };
	restoreCaretAfterWrite(plugin, view, file, path);

	// A caret inside one item of an object list opens **that item**, not the list around it.
	if (root.type === "ObjectList" && path.itemIndex !== undefined && path.keys.length > 1) {
		openListItem(plugin, ctx, root, path.itemIndex);
		return;
	}
	void runControlAction(ctx, root);
}

/** The list's editor, opened straight onto the item the caret was in. */
function openListItem(plugin: FileclassPlugin, ctx: EditContext, field: Field, at: number): void {
	const current = readFieldValue(plugin.app, ctx.file, field);
	new ObjectListEditorModal(plugin.app, {
		title: `Edit ${field.name}`,
		field,
		childFields: childFieldsOf(ctx.allFields, field),
		promptChild: (f, cur, cb) => void promptFieldValue(ctx, f, cur, cb),
		deps: makeDisplayDeps(ctx.allFields),
		initial: asListValue(current),
		stray: strayText(current),
		openAt: at,
		onSave: (list) => void writeFieldValue(plugin.app, ctx.file, field, list),
	}).open();
}

/**
 * Puts the caret back on the field's line once the write has landed.
 *
 * A controller writes through `processFrontMatter`, which rewrites the block: line numbers move,
 * and the caret ends up wherever the rewrite left it — which for the flow this serves (jump to a
 * field, fix it, jump to the next) is the one thing that must not happen. The field is remembered
 * as its **chain of keys**, not as a line number, and looked up again in the text as it is after
 * the write.
 *
 * One shot, and short-lived: the handler goes as soon as it fires, and expires anyway, so a
 * cancelled modal cannot move the caret on some unrelated edit half an hour later.
 */
function restoreCaretAfterWrite(
	plugin: FileclassPlugin,
	view: MarkdownView,
	file: TFile,
	path: CaretPath
): void {
	let done = false;
	const stop = (): void => {
		if (done) return;
		done = true;
		plugin.app.metadataCache.offref(ref);
	};
	const ref = plugin.app.metadataCache.on("changed", (changed) => {
		if (changed.path !== file.path) return;
		stop();
		// The cache fires before the editor has the new text; one tick is enough for both to agree.
		window.setTimeout(() => {
			if (view.file?.path !== file.path) return;
			const line = lineOfPath(view.editor.getValue().split("\n"), path);
			if (line === null) return;
			view.editor.setCursor({ line, ch: view.editor.getLine(line).length });
			view.editor.focus();
		}, 50);
	});
	plugin.registerEvent(ref);
	window.setTimeout(stop, 30_000);
}
