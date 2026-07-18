/*
 * Note-fields modal (ARCHITECTURE.md §19.1). The single hub for a note's
 * fields: lists its resolved root fields with their current values and
 * per-field Edit/Clear, plus header actions. All editing reuses the P2
 * dispatcher (updateField/clearField) — no new write path. Re-renders on
 * metadata changes so edits made through sub-modals show immediately.
 */
import { EventRef, Modal, Setting, setIcon, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";
import { makeDisplayDeps } from "../fields/displayDeps";
import {
	clearField,
	cycleField,
	EditContext,
	toggleBooleanField,
	updateField,
} from "../fields/fieldActions";
import { describeField, DisplayDeps } from "../fields/objectDisplay";
import { isInputSupported } from "../fields/support";
import { fieldTypeIcon } from "../fields/typeIcons";
import { readFieldValue } from "../io/read";
import { Field, isRootField } from "../schema/field";
import { AddFileClassModal } from "./addFileClassModal";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { makeIndicatorIcon, MODAL_SCOPE, navIndicatorFile } from "./indicator/indicatorDom";
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
				// Hovering a fileClass marks the rows of the fields it declares.
				link.addEventListener("mouseenter", () => this.highlightOwner(cls));
				link.addEventListener("mouseleave", () => this.highlightOwner(null));
			});
		}
	}

	/** Marks field rows declared by `name` (footer hover); null clears. */
	private highlightOwner(name: string | null): void {
		this.contentEl.querySelectorAll<HTMLElement>(".fileclass-field-row").forEach((row) => {
			row.toggleClass("is-fc-highlight", name !== null && row.dataset.fcOwner === name);
		});
	}

	private renderFieldRow(ctx: EditContext, deps: DisplayDeps, field: Field): void {
		const value = describeField(field, readFieldValue(this.app, this.file, field), deps);
		// Compact row: the type is shown as a leading icon, not a text label.
		const setting = new Setting(this.contentEl).setName(field.name);
		setting.settingEl.addClass("fileclass-field-row");
		setting.settingEl.dataset.fcOwner = field.fileClassName; // for footer hover highlight
		const typeIcon = createSpan({ cls: "fileclass-type-icon" });
		typeIcon.setAttribute("aria-label", field.type);
		setIcon(typeIcon, fieldTypeIcon(field.type));
		setting.nameEl.prepend(typeIcon);

		const valueEl = setting.controlEl.createSpan({ cls: "fileclass-field-value" });
		if (value) valueEl.setAttribute("title", value); // full value on hover (truncated)
		renderValueWithLinks(valueEl, value, this.file.path, this.app, (linktext) =>
			this.linkIndicator(linktext)
		);

		this.addRowActions(ctx, setting, field);
	}

	/** Right-side quick actions, chosen by field type. */
	private addRowActions(ctx: EditContext, setting: Setting, field: Field): void {
		if (field.type === "Boolean") {
			setting.addExtraButton((b) =>
				b.setIcon("toggle-left").setTooltip("Toggle").onClick(() => void toggleBooleanField(ctx, field))
			);
		} else if (field.type === "Cycle") {
			setting.addExtraButton((b) =>
				b.setIcon("rotate-cw").setTooltip("Next value").onClick(() => void cycleField(ctx, field))
			);
		} else if (isInputSupported(field.type)) {
			setting.addExtraButton((b) =>
				b.setIcon("pencil").setTooltip("Edit").onClick(() => void updateField(ctx, field))
			);
		}
		setting.addExtraButton((b) =>
			b
				.setIcon("x")
				.setTooltip("Clear")
				.onClick(() => void clearField(this.app, this.file, field))
		);
	}

	/** The field indicator for a linked note (fileClass fields), or null. */
	private linkIndicator(linktext: string): HTMLElement | null {
		const dest = this.app.metadataCache.getFirstLinkpathDest(linktext, this.file.path);
		if (!dest) return null;
		const target = navIndicatorFile(this.plugin, dest.path);
		return target ? makeIndicatorIcon(this.plugin, target, MODAL_SCOPE) : null;
	}
}
