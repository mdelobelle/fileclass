/*
 * fileClass fields manager (ARCHITECTURE.md §20.2). Lists a fileClass's own
 * field definitions and lets the user add / edit / remove / reorder them. Each
 * action is one processFrontMatter write on the fileClass note; the modal
 * re-renders from the live frontmatter as writes land. Per-type option settings
 * (§20.3) come in later slices — here a field is name + type.
 */
import { EventRef, Modal, Notice, Setting, TFile } from "obsidian";

import { modalTitle } from "./modalTitle";

import type FileclassPlugin from "../../main";
import { childPathOf, Field } from "../schema/field";
import { parseFileClass } from "../schema/fileClass";
import { dateFormatDefaults } from "../settings/settings";
import { mutateFields } from "../schema/fileClassIo";
import {
	addFieldDef,
	collectFieldIds,
	moveFieldDef,
	removeFieldDef,
	updateFieldDef,
} from "../schema/fileClassWrite";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { FieldDefModal, FieldDefResult } from "./fieldDefModal";
import { writeFieldDependency } from "./fieldSettings";
import { makeStickyFooter } from "./modalFooter";
import { FileClassOptionsModal } from "./fileClassOptionsModal";
import { openBulkEdit } from "./bulkEditModal";
import { pickAndCreateBase } from "../views/baseFileGenerator";
import { fileClassBaseFile, openFileClassBase } from "../views/baseSync";

export class FileClassSchemaModal extends Modal {
	private changeRef?: EventRef;

	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly name: string,
		private readonly file: TFile,
		/** "" for the root; a field id-path when editing an object's children. */
		private readonly parentPath = "",
		/**
		 * Closes whatever opened this modal, for the actions that navigate away
		 * (opening a base leaves a modal stranded over the view it just opened).
		 */
		private readonly closeParent?: () => void
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

	/**
	 * Everything you can do to the fileClass itself, in the modal that edits it —
	 * the same set as its right-click menu, so the icon, the menu and the
	 * note-fields breadcrumb all land on one screen with nothing missing.
	 */
	private renderClassActions(contentEl: HTMLElement): void {
		const hasBase = !!fileClassBaseFile(this.plugin, this.name);
		const leave = () => {
			this.close();
			this.closeParent?.();
		};
		new Setting(contentEl)
			.setName("This fileClass")
			.addButton((b) =>
				b
					.setButtonText("Options…")
					.setTooltip("Icon, inheritance, base sync, bindings")
					.onClick(() => new FileClassOptionsModal(this.plugin, this.name, this.file).open())
			)
			.addExtraButton((b) =>
				b
					.setIcon("layout-grid")
					.setTooltip(hasBase ? "Modify its base" : "Create a base")
					.onClick(() => {
						leave();
						pickAndCreateBase(this.plugin, this.name);
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("table")
					.setTooltip(hasBase ? "Open its base" : "No base yet")
					.setDisabled(!hasBase)
					.onClick(() => {
						leave();
						openFileClassBase(this.plugin, this.name);
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("replace")
					.setTooltip("Bulk edit one of its fields")
					.onClick(() => {
						this.close();
						openBulkEdit(this.plugin, this.name);
					})
			);
	}

	/** Fields at the current level (root or an object's children), read fresh. */
	private ownFields(): Field[] {
		const fm = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		return parseFileClass(this.name, fm).fields.filter((f) => f.path === this.parentPath);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const heading = this.parentPath ? `${this.name} › children` : `Schema — ${this.name}`;
		modalTitle(contentEl, heading);

		if (!this.parentPath) this.renderClassActions(contentEl);

		const fields = this.ownFields();
		if (!fields.length) contentEl.createEl("p", { text: "No fields yet." });

		fields.forEach((field, i) => {
			const setting = new Setting(contentEl)
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
				);

			if (field.type === "Object" || field.type === "ObjectList") {
				setting.addButton((b) =>
					b.setButtonText("Children").onClick(() =>
						new FileClassSchemaModal(
							this.plugin,
							this.name,
							this.file,
							childPathOf(field)
						).open()
					)
				);
			}

			setting
				.addButton((b) => b.setButtonText("Edit").onClick(() => this.editField(field)))
				.addExtraButton((b) =>
					b.setIcon("trash").setTooltip("Remove").onClick(() => this.remove(field.id))
				);
		});

		new Setting(makeStickyFooter(contentEl)).addButton((b) =>
			b.setButtonText("Add field").setCta().onClick(() => this.addField())
		);
	}

	private addField(): void {
		new FieldDefModal(this.app, {
			title: "Add field",
			dateDefaults: dateFormatDefaults(this.plugin.settings),
			classFields: this.plugin.index.getResolvedFields(this.name),
			onSubmit: (r) => {
				void mutateFields(this.app, this.file, (fields) =>
					addFieldDef(
						fields,
						{ name: r.name, type: r.type, options: r.options, path: this.parentPath },
						collectFieldIds(fields)
					)
				).then(() => this.writeDependency(r));
			},
		}).open();
	}

	/** What saving a definition implies beyond the write — shared with the other door. */
	private writeDependency(r: FieldDefResult): void {
		writeFieldDependency(this.plugin, this.name, r);
	}

	private editField(field: Field): void {
		new FieldDefModal(this.app, {
			title: "Edit field",
			dateDefaults: dateFormatDefaults(this.plugin.settings),
			classFields: this.plugin.index.getResolvedFields(this.name),
			initial: { name: field.name, type: field.type, options: field.options },
			onSubmit: (r) => {
				void mutateFields(this.app, this.file, (fields) =>
					updateFieldDef(fields, field.id, {
						name: r.name,
						type: r.type,
						options: r.options,
					})
				).then(() => this.writeDependency(r));
			},
		}).open();
	}

	private remove(id: string): void {
		void mutateFields(this.app, this.file, (fields) => removeFieldDef(fields, id));
	}

	private move(id: string, dir: -1 | 1): void {
		void mutateFields(this.app, this.file, (fields) => moveFieldDef(fields, id, dir));
	}
}

/**
 * Opens the schema editor for `name`, or a fileClass picker when omitted.
 * `closeParent` is dismissed by the actions that navigate away from the modal.
 */
export function openFileClassSchema(
	plugin: FileclassPlugin,
	name?: string,
	closeParent?: () => void
): void {
	const open = (n: string) => {
		const file = plugin.index.getFileClassFile(n);
		if (!file) {
			new Notice(`Fileclass: note for "${n}" not found.`);
			return;
		}
		new FileClassSchemaModal(plugin, n, file, "", closeParent).open();
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
