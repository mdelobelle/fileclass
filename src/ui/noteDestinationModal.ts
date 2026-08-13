/*
 * One destination for a new note of a class: a folder, and a template (#84 follow-up).
 *
 * The same modal adds and edits. A class often has several — a `Person` met professionally starts
 * from one template and lands in one folder, the same class for an artist starts from another — so
 * the pair is a thing you keep a list of, and each one is edited on its own.
 */
import { Modal, Notice, Setting } from "obsidian";

import type FileclassPlugin from "../../main";
import { NoteDestination } from "../schema/newNote";
import { NoteFileSuggest } from "./baseSuggest";
import { FolderSuggest } from "./folderSuggest";
import { modalTitle } from "./modalTitle";

class NoteDestinationModal extends Modal {
	private readonly draft: NoteDestination;
	private settled = false;

	constructor(
		plugin: FileclassPlugin,
		private readonly editing: boolean,
		destination: NoteDestination,
		private readonly done: (destination: NoteDestination | null) => void
	) {
		super(plugin.app);
		this.draft = { ...destination };
	}

	onOpen(): void {
		const { contentEl } = this;
		modalTitle(contentEl, this.editing ? "Edit a destination" : "Add a destination");

		new Setting(contentEl)
			.setName("Name")
			.setDesc("What you call this context — how it is listed, and how it is offered when you create a note.")
			.addText((t) => {
				t.setPlaceholder("Professional, Artist, …")
					.setValue(this.draft.name ?? "")
					.onChange((v) => (this.draft.name = v));
				window.setTimeout(() => t.inputEl.focus(), 0);
			});

		new Setting(contentEl)
			.setName("Notes folder")
			.setDesc(
				"Where a note created this way goes. Blank falls back to the class's single bound folder, " +
					"then to Obsidian's default for new notes."
			)
			.addText((t) => {
				t.setValue(this.draft.folder ?? "").onChange((v) => (this.draft.folder = v));
				new FolderSuggest(this.app, t.inputEl);
			});

		new Setting(contentEl)
			.setName("Note template")
			.setDesc(
				"Applied before the fields are written, so a template's own frontmatter merges rather than " +
					"duplicating. Blank creates the note from nothing but its schema."
			)
			.addText((t) => {
				t.setValue(this.draft.template ?? "").onChange((v) => (this.draft.template = v));
				new NoteFileSuggest(this.app, t.inputEl);
			});

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText(this.editing ? "Save" : "Add")
				.setCta()
				.onClick(() => this.submit())
		);
	}

	private submit(): void {
		const folder = this.draft.folder?.trim();
		const template = this.draft.template?.trim();
		if (!folder && !template) {
			// A pair naming neither is a row that says nothing and creates nothing.
			new Notice("Fileclass: give the destination a folder, a template, or both.");
			return;
		}
		this.settled = true;
		this.done({
			name: this.draft.name?.trim() || undefined,
			folder: folder || undefined,
			template: template || undefined,
		});
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) this.done(null);
	}
}

/** Opens the add/edit modal; resolves to the destination, or null if it was closed. */
export function editNoteDestination(
	plugin: FileclassPlugin,
	destination: NoteDestination = {},
	editing = false
): Promise<NoteDestination | null> {
	return new Promise((resolve) => {
		new NoteDestinationModal(plugin, editing, destination, resolve).open();
	});
}

/** Asks before dropping a destination, naming what is about to go. */
export function confirmRemoveDestination(plugin: FileclassPlugin, label: string): Promise<boolean> {
	return new Promise((resolve) => {
		let answered = false;
		const modal = new Modal(plugin.app);
		modal.onOpen = () => {
			modalTitle(modal.contentEl, "Remove this destination?");
			modal.contentEl.createEl("p", {
				cls: "setting-item-description",
				text: `${label} — the folder and the template themselves are left alone; only this class stops offering them.`,
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
