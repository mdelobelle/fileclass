/*
 * Declaring a relation from the class's options: which field, and which view reads it backwards.
 *
 * Until now a declaration could only be made **from** a view — running *Use this view for a
 * relation* while looking at it — and could not be removed at all short of editing the frontmatter
 * by hand. That is a strange shape for something a class owns: everything else about a class is
 * managed on the class. This is the other door, and the one that closes.
 *
 * Nothing here touches a base. The command that adopts a view can retype it and add the missing
 * clause because the reader is looking at that view; from here, a view that does not read the field
 * backwards is **named as such** and left alone — the same rule as everywhere else in this plugin.
 */
import { App, Modal, Notice, Setting, parseYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import { Field, isRootField } from "../schema/field";
import { RelatedView } from "../schema/fileClass";
import { filtersReadFieldBackwards, formatViewRef, linkCardinality, parseViewRef } from "../views/reverseView";
import { modalTitle } from "./modalTitle";

/** One view of one base, with what its filters say. */
export interface BaseViewRef {
	path: string;
	viewName: string;
	filters: unknown;
}

/** `Books.base › A's Bs` — how a view reads in a list. */
export function baseViewLabel(path: string, viewName: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	return `${file.endsWith(".base") ? file.slice(0, -".base".length) : file} › ${viewName}`;
}

/** How a declaration reads in a list: the field, then the view it points at. */
export function relatedViewLabel(entry: RelatedView): string {
	const ref = parseViewRef(entry.view);
	return ref ? `${entry.field} → ${baseViewLabel(ref.path, ref.viewName)}` : `${entry.field} → ${entry.view}`;
}

/**
 * Every view of every base in the vault.
 *
 * Read up front so the modal's dropdown is synchronous: a `.base` is YAML on disk, and a dropdown
 * that fills in after it opens is a dropdown you pick from twice. A base that does not parse is
 * skipped rather than reported — this is a picker, not a linter.
 */
export async function allBaseViews(app: App): Promise<BaseViewRef[]> {
	const out: BaseViewRef[] = [];
	const bases = app.vault.getFiles().filter((f) => f.extension === "base");
	for (const file of bases) {
		try {
			const parsed = (parseYaml(await app.vault.cachedRead(file)) ?? {}) as { views?: unknown };
			const views = Array.isArray(parsed.views) ? (parsed.views as { name?: unknown; filters?: unknown }[]) : [];
			for (const view of views) {
				if (typeof view?.name === "string" && view.name.trim())
					out.push({ path: file.path, viewName: view.name, filters: view.filters });
			}
		} catch {
			/* a base nobody can parse offers no views */
		}
	}
	return out.sort((a, b) => baseViewLabel(a.path, a.viewName).localeCompare(baseViewLabel(b.path, b.viewName)));
}

/** The class's own link fields — the only ones a view can read backwards. */
function linkFields(plugin: FileclassPlugin, className: string): Field[] {
	return plugin.index
		.getResolvedFields(className)
		.filter((f) => isRootField(f) && !!linkCardinality(f.type));
}

class RelatedViewModal extends Modal {
	private field: string;
	private view: string;
	private settled = false;
	private warningEl?: HTMLElement;

	constructor(
		plugin: FileclassPlugin,
		private readonly fields: Field[],
		private readonly views: BaseViewRef[],
		private readonly editing: boolean,
		entry: RelatedView | undefined,
		private readonly done: (entry: RelatedView | null) => void
	) {
		super(plugin.app);
		this.field = entry?.field ?? fields[0]?.name ?? "";
		this.view = entry?.view ?? (views[0] ? formatViewRef(views[0].path, views[0].viewName) : "");
	}

	onOpen(): void {
		const { contentEl } = this;
		modalTitle(contentEl, this.editing ? "Edit a related view" : "Add a related view");

		new Setting(contentEl)
			.setName("Field")
			.setDesc("The link field this view shows the other end of.")
			.addDropdown((d) => {
				for (const f of this.fields) d.addOption(f.name, `${f.name} (${f.type})`);
				d.setValue(this.field).onChange((v) => {
					this.field = v;
					this.refreshWarning();
				});
			});

		new Setting(contentEl)
			.setName("View")
			.setDesc("The view that lists the notes pointing here. Its name is yours — nothing reads it.")
			.addDropdown((d) => {
				for (const v of this.views) d.addOption(formatViewRef(v.path, v.viewName), baseViewLabel(v.path, v.viewName));
				d.setValue(this.view).onChange((v) => {
					this.view = v;
					this.refreshWarning();
				});
			});

		this.warningEl = contentEl.createDiv({ cls: "setting-item-description fileclass-related-warning" });
		this.refreshWarning();

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText(this.editing ? "Save" : "Add")
				.setCta()
				.onClick(() => this.submit())
		);
	}

	/**
	 * Says when the chosen view does not filter on the note it is read from.
	 *
	 * Embedded in a note, such a view shows **every** row to every note — so declaring it is
	 * declaring something it does not do. Said rather than fixed: the filter is the author's, and
	 * the command that adopts a view from the view itself is where the clause can be offered.
	 */
	private refreshWarning(): void {
		if (!this.warningEl) return;
		const ref = parseViewRef(this.view);
		const view = ref ? this.views.find((v) => v.path === ref.path && v.viewName === ref.viewName) : undefined;
		const reads = view && this.field ? filtersReadFieldBackwards(view.filters, this.field) : true;
		this.warningEl.toggleClass("is-visible", !reads);
		this.warningEl.setText(
			reads
				? ""
				: `This view does not filter on "${this.field}" against the note it is read from — embedded in a note, ` +
						`it will show every row to every note. Open it and run "Use this view for a relation" to add that clause.`
		);
	}

	private submit(): void {
		if (!this.field || !this.view) {
			new Notice("Fileclass: pick a field and a view.");
			return;
		}
		this.settled = true;
		this.done({ field: this.field, view: this.view });
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) this.done(null);
	}
}

/** Opens the add/edit modal; resolves to the declaration, or null if it was closed. */
export async function editRelatedView(
	plugin: FileclassPlugin,
	className: string,
	entry?: RelatedView
): Promise<RelatedView | null> {
	const fields = linkFields(plugin, className);
	if (!fields.length) {
		new Notice(`Fileclass: ${className} has no link field, so no view can read one of them backwards.`);
		return null;
	}
	const views = await allBaseViews(plugin.app);
	if (!views.length) {
		new Notice("Fileclass: no base in this vault holds a view yet.");
		return null;
	}
	return new Promise((resolve) => {
		new RelatedViewModal(plugin, fields, views, !!entry, entry, resolve).open();
	});
}

/** Asks before dropping a declaration, naming what is about to go. */
export function confirmRemoveRelatedView(plugin: FileclassPlugin, label: string): Promise<boolean> {
	return new Promise((resolve) => {
		let answered = false;
		const modal = new Modal(plugin.app);
		modal.onOpen = () => {
			modalTitle(modal.contentEl, "Remove this related view?");
			modal.contentEl.createEl("p", {
				cls: "setting-item-description",
				text:
					`${label} — the base and the view are left alone, and so are the embeds pointing at them. ` +
					`What goes is this class saying that view reads the field backwards: the view stops offering ` +
					`"New … with …", and inserting this relation into a note will ask for a view again.`,
			});
			new Setting(modal.contentEl)
				.addButton((b) =>
					b.setButtonText("Keep").onClick(() => {
						answered = true;
						resolve(false);
						modal.close();
					})
				)
				.addButton((b) =>
					b
						.setButtonText("Remove")
						.setWarning()
						.onClick(() => {
							answered = true;
							resolve(true);
							modal.close();
						})
				);
		};
		modal.onClose = () => {
			modal.contentEl.empty();
			if (!answered) resolve(false);
		};
		modal.open();
	});
}
