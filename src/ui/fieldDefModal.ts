/*
 * Add/edit a single field definition (ARCHITECTURE.md §20.2/§20.3). Name, type,
 * and the per-type option settings (Number/Date/List for now — §20.3). Types we
 * don't yet have settings for keep their existing options untouched.
 */
import { App, Modal, Notice, Setting } from "obsidian";

import { renderFieldOptionsSettings } from "../fields/input/fieldOptionsSettings";
import { buildFieldOptions, optionsToDraft, OptionsDraft } from "../fields/optionsDraft";
import { FIELD_TYPES, FieldOptions, FieldType } from "../schema/field";
import { makeStickyFooter } from "./modalFooter";

/**
 * Types offered in the schema editor. Excludes only Lookup/Formula (computed —
 * out of scope, §9); legacy fields of those types still load and display but
 * can't be authored here.
 */
const EXCLUDED = new Set<FieldType>(["Lookup", "Formula"]);
export const EDITABLE_FIELD_TYPES: FieldType[] = FIELD_TYPES.filter((t) => !EXCLUDED.has(t));

/** Friendlier picker labels; the stored type id is unchanged. */
const TYPE_LABELS: Partial<Record<FieldType, string>> = {
	MultiInput: "Multi input (repeatable)",
	Duration: "Duration (length of time)",
	CycleDuration: "Cycle duration (interval cycle)",
	Location: "Location (coordinates)",
	Icon: "Icon (picker)",
	Color: "Color (picker)",
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
	private required: boolean;

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
		const io = opts.initial?.options;
		this.required = !!io && !Array.isArray(io) && (io.required === true || io.required === "true");
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
			for (const t of EDITABLE_FIELD_TYPES) d.addOption(t, TYPE_LABELS[t] ?? t);
			d.setValue(this.type).onChange((v) => {
				this.type = v as FieldType;
				renderOptions();
			});
		});

		new Setting(contentEl)
			.setName("Required")
			.setDesc("Flag the note as invalid when this field has no value.")
			.addToggle((t) => t.setValue(this.required).onChange((v) => (this.required = v)));

		renderOptions();

		new Setting(makeStickyFooter(contentEl)).addButton((b) =>
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
						options: this.withRequired(buildFieldOptions(this.type, this.draft)),
					});
					this.close();
				})
		);
	}

	/** Merges the common `required` flag into the type's options (or removes it). */
	private withRequired(options: FieldOptions | undefined): FieldOptions | undefined {
		if (options === undefined) return this.required ? { required: true } : undefined;
		if (Array.isArray(options)) return options; // inline values list — required N/A
		if (this.required) options.required = true;
		else delete options.required;
		return options;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
