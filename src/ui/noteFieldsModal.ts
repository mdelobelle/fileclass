/*
 * Note-fields modal (ARCHITECTURE.md §19.1). The single hub for a note's
 * fields: lists its resolved root fields with their current values and
 * per-field Edit/Clear, plus header actions. All editing reuses the P2
 * dispatcher (updateField/clearField) — no new write path. Re-renders on
 * metadata changes so edits made through sub-modals show immediately.
 */
import { EventRef, Modal, Setting, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";
import { makeDisplayDeps } from "../fields/displayDeps";
import { clearField, EditContext, updateField } from "../fields/fieldActions";
import { describeField, DisplayDeps } from "../fields/objectDisplay";
import { isInputSupported } from "../fields/support";
import { readFieldValue } from "../io/read";
import { Field, isRootField } from "../schema/field";
import { AddFileClassModal } from "./addFileClassModal";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { renderValueWithLinks } from "./valueLinks";

export class NoteFieldsModal extends Modal {
	private changeRef?: EventRef;

	constructor(private readonly plugin: FileclassPlugin, private readonly file: TFile) {
		super(plugin.app);
	}

	onOpen(): void {
		this.render();
		// Reflect writes (including those from sub-modals) as they land.
		this.changeRef = this.app.metadataCache.on("changed", (f) => {
			if (f.path === this.file.path) this.render();
		});
	}

	onClose(): void {
		if (this.changeRef) this.app.metadataCache.offref(this.changeRef);
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `Fields — ${this.file.basename}` });

		const fields = this.plugin.index.getFields(this.file);
		const ctx: EditContext = { host: this.plugin, file: this.file, allFields: fields };
		const deps = makeDisplayDeps(this.plugin, fields);
		const rootFields = fields.filter((f) => isRootField(f));

		if (!rootFields.length) {
			contentEl.createEl("p", { text: "No fields apply to this note." });
		}

		for (const field of rootFields) {
			this.renderFieldRow(ctx, deps, field);
		}

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Insert missing fields")
					.onClick(() => void insertMissingFields(this.app, this.file, fields))
			)
			.addButton((b) =>
				b
					.setButtonText("Add fileClass")
					.onClick(() => new AddFileClassModal(this.plugin, this.file).open())
			);

		this.renderFileClassFooter();
	}

	/** Footer: each applied fileClass as an inheritance breadcrumb (clickable). */
	private renderFileClassFooter(): void {
		const names = this.plugin.index.getFileClasses(this.file);
		if (!names.length) return;

		const footer = this.contentEl.createDiv({ cls: "fileclass-modal-footer" });
		for (const name of names) {
			const crumb = footer.createDiv({ cls: "fileclass-breadcrumb" });
			// Root → leaf: ancestors are nearest-first, so reverse then add self.
			const chain = [...this.plugin.index.getAncestors(name)].reverse();
			chain.push(name);
			chain.forEach((cls, i) => {
				if (i > 0) crumb.createSpan({ cls: "fileclass-breadcrumb-sep", text: "›" });
				const link = crumb.createEl("a", {
					cls: "fileclass-breadcrumb-item",
					text: cls,
					href: "#",
				});
				link.addEventListener("click", (e) => {
					e.preventDefault();
					openFileClassSchema(this.plugin, cls);
				});
			});
		}
	}

	private renderFieldRow(ctx: EditContext, deps: DisplayDeps, field: Field): void {
		const value = describeField(field, readFieldValue(this.app, this.file, field), deps);
		const setting = new Setting(this.contentEl).setName(field.name).setDesc(field.type);
		setting.settingEl.addClass("fileclass-field-row");
		const valueEl = setting.controlEl.createSpan({ cls: "fileclass-field-value" });
		if (value) valueEl.setAttribute("title", value); // full value on hover (truncated)
		renderValueWithLinks(valueEl, value, this.file.path, this.app);

		if (isInputSupported(field.type)) {
			setting.addButton((b) =>
				b.setButtonText("Edit").onClick(() => void updateField(ctx, field))
			);
		}
		setting.addExtraButton((b) =>
			b
				.setIcon("x")
				.setTooltip("Clear")
				.onClick(() => void clearField(this.app, this.file, field))
		);
	}
}
