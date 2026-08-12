/*
 * "Use this view for a relation" — adopting a view somebody already wrote (#154).
 *
 * A vault that predates Fileclass has these views already: hand-written `this.file` filters,
 * embedded in hundreds of notes under names their author chose. Rewriting those embeds is not an
 * option, and neither is asking anyone to rename a view two thousand notes point at.
 *
 * So this takes the view as it stands. It changes **one word** in the base — the view's `type`,
 * so the cells become editable — and writes one line in the class note saying which field this view
 * reads backwards. Nothing else moves: not the name, not the filters, not the columns, not a single
 * embed.
 */
import { Notice, TFile, parseYaml, stringifyYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { baseBindingOptionsFromOptions } from "../fields/options";
import { isRootField } from "../schema/field";
import { toRelatedViews } from "../schema/fileClass";
import { FILECLASS_TABLE_VIEW } from "../views/columns";
import { confirmCloseOpenBase, detachAndAwaitSave, openBaseLeaves } from "../views/baseSync";
import { formatViewRef, linkCardinality } from "../views/reverseView";

/** The base view the reader is looking at, from the active leaf. */
function activeBaseView(plugin: FileclassPlugin): { path: string; viewName: string } | null {
	const leaf = plugin.app.workspace.getMostRecentLeaf();
	const state = leaf?.getViewState().state as { file?: string; viewName?: string } | undefined;
	if (!state?.file || !state.viewName) return null;
	return { path: state.file, viewName: state.viewName };
}

/** Every link field of every class, as `Book.author` — the relations a view could be reading. */
function relationChoices(plugin: FileclassPlugin): { fileClass: string; field: string }[] {
	const out: { fileClass: string; field: string }[] = [];
	for (const name of [...plugin.index.fileClassNames].sort((a, b) => a.localeCompare(b))) {
		for (const field of plugin.index.getResolvedFields(name)) {
			if (!isRootField(field) || !linkCardinality(field.type)) continue;
			// A binding is what makes a field a declared relation, here as in discovery.
			if (!baseBindingOptionsFromOptions(field.options).baseFile) continue;
			out.push({ fileClass: name, field: field.name });
		}
	}
	return out;
}

/**
 * Adopts the view the reader is looking at for one relation.
 *
 * Asked rather than guessed: a view's filters may name a field this plugin never wrote, and reading
 * intent out of an expression somebody hand-wrote is how you adopt the wrong one silently.
 */
export function adoptRelatedView(plugin: FileclassPlugin): void {
	const view = activeBaseView(plugin);
	if (!view) {
		new Notice("Fileclass: open the base and the view you want to use, then run this again.");
		return;
	}
	const choices = relationChoices(plugin);
	if (!choices.length) {
		new Notice("Fileclass: no class has a link field bound to a base, so there is no relation to use it for.");
		return;
	}
	new ChoiceSuggestModal(
		plugin.app,
		choices,
		(c) => `${c.fileClass}.${c.field}`,
		(c) => void apply(plugin, view, c.fileClass, c.field),
		`Which relation does "${view.viewName}" show?`
	).open();
}

async function apply(
	plugin: FileclassPlugin,
	view: { path: string; viewName: string },
	fileClass: string,
	field: string
): Promise<void> {
	const app = plugin.app;
	const base = app.vault.getAbstractFileByPath(view.path);
	if (!(base instanceof TFile)) {
		new Notice(`Fileclass: ${view.path} not found.`);
		return;
	}

	// Bases holds an open base's layout in memory and writes it back over ours.
	const openLeaves = openBaseLeaves(app, base.path);
	if (openLeaves.length) {
		if (!(await confirmCloseOpenBase(app, base.name))) {
			new Notice(`Fileclass: "${base.name}" is open — close it, then run this again.`);
			return;
		}
		await detachAndAwaitSave(app, base, openLeaves);
	}

	// Closing it is Bases' own requirement (its in-memory layout would be written back over ours),
	// but the reader ran this *from* that view — so they are put back on it when the write is done.
	const reopen = openLeaves.length > 0;
	let retyped = false;
	try {
		const parsed = (parseYaml(await app.vault.read(base)) ?? {}) as { views?: unknown };
		const views = Array.isArray(parsed.views) ? (parsed.views as { name?: string; type?: string }[]) : [];
		const target = views.find((v) => v?.name === view.viewName);
		if (!target) {
			new Notice(`Fileclass: ${base.name} has no view called "${view.viewName}".`);
			return;
		}
		if (target.type !== FILECLASS_TABLE_VIEW) {
			target.type = FILECLASS_TABLE_VIEW;
			retyped = true;
			await app.vault.modify(base, stringifyYaml(parsed));
		}
	} catch (err) {
		new Notice(`Fileclass: could not read ${base.name} (${(err as Error).message}).`);
		return;
	}

	const note = plugin.index.getFileClassFile(fileClass);
	if (!(note instanceof TFile)) {
		new Notice(`Fileclass: the note for "${fileClass}" was not found.`);
		return;
	}
	await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
		const entries = toRelatedViews(fm.relatedViews);
		const ref = formatViewRef(view.path, view.viewName);
		const at = entries.findIndex((e) => e.field === field);
		if (at >= 0) entries[at] = { field, view: ref };
		else entries.push({ field, view: ref });
		fm.relatedViews = entries;
	});

	if (reopen) {
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(base);
		await leaf.setViewState({ type: "bases", state: { file: view.path, viewName: view.viewName } });
	}

	new Notice(
		retyped
			? `Fileclass: "${view.viewName}" is now an editable table, and ${fileClass} › ${field} points at it.`
			: `Fileclass: ${fileClass} › ${field} now points at "${view.viewName}".`
	);
}
