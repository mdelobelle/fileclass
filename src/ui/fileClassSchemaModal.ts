/*
 * fileClass fields manager (ARCHITECTURE.md §20.2). Lists a fileClass's own
 * field definitions and lets the user add / edit / remove / reorder them. Each
 * action is one processFrontMatter write on the fileClass note; the modal
 * re-renders from the live frontmatter as writes land. Per-type option settings
 * (§20.3) come in later slices — here a field is name + type.
 */
import { EventRef, Modal, Notice, Setting, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { Field } from "../schema/field";
import { parseFileClass } from "../schema/fileClass";
import { mutateFields } from "../schema/fileClassIo";
import {
	addFieldDef,
	collectFieldIds,
	moveFieldDef,
	removeFieldDef,
	updateFieldDef,
} from "../schema/fileClassWrite";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { FieldDefModal } from "./fieldDefModal";
import { FileClassOptionsModal } from "./fileClassOptionsModal";

export class FileClassSchemaModal extends Modal {
	private changeRef?: EventRef;

	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly name: string,
		private readonly file: TFile
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.render();
		this.changeRef = this.app.metadataCache.on("changed", (f) => {
			if (f.path === this.file.path) this.render();
		});
	}

	onClose(): void {
		if (this.changeRef) this.app.metadataCache.offref(this.changeRef);
		this.contentEl.empty();
	}

	/** Own fields, read fresh from the note's frontmatter (not the debounced index). */
	private ownFields() {
		const fm = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		return parseFileClass(this.name, fm).fields;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `Schema — ${this.name}` });

		new Setting(contentEl)
			.setName("fileClass options")
			.addButton((b) =>
				b
					.setButtonText("Options…")
					.onClick(() => new FileClassOptionsModal(this.plugin, this.name, this.file).open())
			);

		const fields = this.ownFields();
		if (!fields.length) contentEl.createEl("p", { text: "No fields yet." });

		fields.forEach((field, i) => {
			new Setting(contentEl)
				.setName(field.name)
				.setDesc(field.type)
				.addExtraButton((b) =>
					b
						.setIcon("chevron-up")
						.setTooltip("Move up")
						.setDisabled(i === 0)
						.onClick(() => this.move(field.id, -1))
				)
				.addExtraButton((b) =>
					b
						.setIcon("chevron-down")
						.setTooltip("Move down")
						.setDisabled(i === fields.length - 1)
						.onClick(() => this.move(field.id, 1))
				)
				.addButton((b) => b.setButtonText("Edit").onClick(() => this.editField(field)))
				.addExtraButton((b) =>
					b.setIcon("trash").setTooltip("Remove").onClick(() => this.remove(field.id))
				);
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Add field").setCta().onClick(() => this.addField())
		);
	}

	private addField(): void {
		new FieldDefModal(this.app, {
			title: "Add field",
			onSubmit: (r) =>
				void mutateFields(this.app, this.file, (fields) =>
					addFieldDef(fields, { name: r.name, type: r.type }, collectFieldIds(fields))
				),
		}).open();
	}

	private editField(field: Field): void {
		new FieldDefModal(this.app, {
			title: "Edit field",
			initial: { name: field.name, type: field.type },
			onSubmit: (r) =>
				void mutateFields(this.app, this.file, (fields) =>
					updateFieldDef(fields, field.id, { name: r.name, type: r.type })
				),
		}).open();
	}

	private remove(id: string): void {
		void mutateFields(this.app, this.file, (fields) => removeFieldDef(fields, id));
	}

	private move(id: string, dir: -1 | 1): void {
		void mutateFields(this.app, this.file, (fields) => moveFieldDef(fields, id, dir));
	}
}

/** Opens the schema editor for `name`, or a fileClass picker when omitted. */
export function openFileClassSchema(plugin: FileclassPlugin, name?: string): void {
	const open = (n: string) => {
		const file = plugin.index.getFileClassFile(n);
		if (!file) {
			new Notice(`Fileclass: note for "${n}" not found.`);
			return;
		}
		new FileClassSchemaModal(plugin, n, file).open();
	};
	if (name) return open(name);

	const names = plugin.index.fileClassNames;
	if (!names.length) {
		new Notice("Fileclass: no fileClasses defined.");
		return;
	}
	new ChoiceSuggestModal<string>(
		plugin.app,
		[...names].sort(),
		(n) => n,
		open,
		"Select a fileClass to edit"
	).open();
}
