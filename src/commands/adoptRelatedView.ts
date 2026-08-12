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
import { Modal, Notice, Setting, TFile, parseYaml, stringifyYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { baseBindingOptionsFromOptions } from "../fields/options";
import { isRootField } from "../schema/field";
import { toRelatedViews } from "../schema/fileClass";
import { FILECLASS_TABLE_VIEW } from "../views/columns";
import { confirmCloseOpenBase, detachAndAwaitSave, openBaseLeaves } from "../views/baseSync";
import {
	filtersReadFieldBackwards,
	formatViewRef,
	linkCardinality,
	reverseClause,
	withReverseClause,
} from "../views/reverseView";
import { modalTitle } from "../ui/modalTitle";

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
	let filtered = false;
	try {
		const parsed = (parseYaml(await app.vault.read(base)) ?? {}) as { views?: unknown };
		const views = Array.isArray(parsed.views)
			? (parsed.views as { name?: string; type?: string; filters?: unknown }[])
			: [];
		const target = views.find((v) => v?.name === view.viewName);
		if (!target) {
			new Notice(`Fileclass: ${base.name} has no view called "${view.viewName}".`);
			return;
		}

		// A view that does not filter on `this.file` cannot show one note's relations: embedded in
		// every note of the parent class, it would show *every* row to each of them. Saying "this
		// view shows Book.author" of such a view is a statement the view does not make, so it is
		// offered rather than assumed — and rather than silently adopted, which is what this did.
		const cardinality = linkCardinality(
			plugin.index.getResolvedFields(fileClass).find((f) => f.name === field)?.type ?? "Input"
		);
		if (cardinality && !filtersReadFieldBackwards(target.filters, field)) {
			const clause = reverseClause(field, cardinality);
			const add = await confirmAddClause(plugin, view.viewName, clause);
			if (add === null) return;
			if (add) {
				target.filters = withReverseClause(target.filters, clause);
				filtered = true;
			}
		}

		if (target.type !== FILECLASS_TABLE_VIEW) {
			target.type = FILECLASS_TABLE_VIEW;
			retyped = true;
		}
		if (retyped || filtered) await app.vault.modify(base, stringifyYaml(parsed));
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

	const did = [retyped ? "made editable" : "", filtered ? "given the relation's filter" : ""].filter(Boolean);
	new Notice(
		did.length
			? `Fileclass: "${view.viewName}" ${did.join(" and ")}, and ${fileClass} › ${field} points at it.`
			: `Fileclass: ${fileClass} › ${field} now points at "${view.viewName}".`
	);
}

/**
 * Asks whether to add the missing clause. `null` means the reader closed the question, which is not
 * the same as "no": nothing is written at all.
 */
function confirmAddClause(
	plugin: FileclassPlugin,
	viewName: string,
	clause: string
): Promise<boolean | null> {
	return new Promise((resolve) => {
		let answered = false;
		const modal = new Modal(plugin.app);
		modal.onOpen = () => {
			modalTitle(modal.contentEl, `"${viewName}" does not filter on the note it is read from`);
			modal.contentEl.createEl("p", {
				cls: "setting-item-description",
				text:
					"Embedded in a note, it would show every row to every note. Adding this clause makes it " +
					"show only the ones that point at the note holding it — everything else in the filter is kept.",
			});
			modal.contentEl.createEl("pre", { text: clause, cls: "fileclass-clause-preview" });
			new Setting(modal.contentEl)
				.addButton((b) =>
					b.setButtonText("Adopt without it").onClick(() => {
						answered = true;
						resolve(false);
						modal.close();
					})
				)
				.addButton((b) =>
					b
						.setButtonText("Add the clause")
						.setCta()
						.onClick(() => {
							answered = true;
							resolve(true);
							modal.close();
						})
				);
		};
		modal.onClose = () => {
			modal.contentEl.empty();
			if (!answered) resolve(null);
		};
		modal.open();
	});
}
