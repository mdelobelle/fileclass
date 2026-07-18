/*
 * Add/edit a single field definition (ARCHITECTURE.md §20.2/§20.3). Name, type,
 * and the per-type option settings (Number/Date/List for now — §20.3). Types we
 * don't yet have settings for keep their existing options untouched.
 */
import { App, Modal, Notice, Setting } from "obsidian";

import { renderFieldOptionsSettings } from "../fields/input/fieldOptionsSettings";
import { buildFieldOptions, optionsToDraft, OptionsDraft } from "../fields/optionsDraft";
import { FIELD_TYPES, FieldOptions, FieldType } from "../schema/field";

/**
 * Types offered in the schema editor. Excludes only Lookup/Formula (computed —
 * out of scope, §9); legacy fields of those types still load and display but
 * can't be authored here.
 */
const EXCLUDED = new Set<FieldType>(["Lookup", "Formula"]);
export const EDITABLE_FIELD_TYPES: FieldType[] = FIELD_TYPES.filter((t) => !EXCLUDED.has(t));

/** Friendlier picker labels; the stored type id is unchanged. */
const TYPE_LABELS: Partial<Record<FieldType, string>> = {
	Select: "Select (single value)",
	Multi: "Multi (select several)",
	Cycle: "Cycle (rotate values)",
	File: "File (link)",
	MultiFile: "Multi file (links)",
	Media: "Media (embed/link)",
	MultiMedia: "Multi media",
	Object: "Object (nested)",
	ObjectList: "Object list",
};

export interface FieldDefResult {
	name: string;
	type: FieldType;
	/** Undefined when this editor doesn't manage the type's options (preserve). */
	options?: FieldOptions;
}

export class FieldDefModal extends Modal {
	private name: string;
	private type: FieldType;
	private draft: OptionsDraft;

	constructor(
		app: App,
		private readonly opts: {
			title: string;
			initial?: { name: string; type: FieldType; options: FieldOptions };
			onSubmit: (result: FieldDefResult) => void;
		}
	) {
		super(app);
		this.name = opts.initial?.name ?? "";
		this.type = opts.initial?.type ?? "Input";
		this.draft = optionsToDraft(this.type, opts.initial?.options ?? []);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });

		new Setting(contentEl).setName("Name").addText((t) =>
			t.setValue(this.name).onChange((v) => (this.name = v))
		);

		const optionsEl = contentEl.createDiv();
		const renderOptions = () =>
			renderFieldOptionsSettings(optionsEl, this.type, this.draft, { app: this.app });

		new Setting(contentEl).setName("Type").addDropdown((d) => {
			EDITABLE_FIELD_TYPES.forEach((t) => d.addOption(t, TYPE_LABELS[t] ?? t));
			d.setValue(this.type).onChange((v) => {
				this.type = v as FieldType;
				renderOptions();
			});
		});

		renderOptions();

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					const name = this.name.trim();
					if (!name) {
						new Notice("Fileclass: a field name is required.");
						return;
					}
					this.opts.onSubmit({
						name,
						type: this.type,
						options: buildFieldOptions(this.type, this.draft),
					});
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
