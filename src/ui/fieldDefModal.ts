/*
 * Add/edit a single field definition (ARCHITECTURE.md §20.2). Name + type only
 * in this slice; per-type option settings (§20.3) arrive in P2-ter.2/.3.
 */
import { App, Modal, Notice, Setting } from "obsidian";

import { FIELD_TYPES, FieldType } from "../schema/field";

/** Types offered in the schema editor (Canvas/JSON/YAML are deferred, §7). */
const DEFERRED = new Set<FieldType>(["Canvas", "CanvasGroup", "CanvasGroupLink", "JSON", "YAML"]);
export const EDITABLE_FIELD_TYPES: FieldType[] = FIELD_TYPES.filter((t) => !DEFERRED.has(t));

export interface FieldDefResult {
	name: string;
	type: FieldType;
}

export class FieldDefModal extends Modal {
	private name: string;
	private type: FieldType;

	constructor(
		app: App,
		private readonly opts: {
			title: string;
			initial?: FieldDefResult;
			onSubmit: (result: FieldDefResult) => void;
		}
	) {
		super(app);
		this.name = opts.initial?.name ?? "";
		this.type = opts.initial?.type ?? "Input";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });

		new Setting(contentEl).setName("Name").addText((t) =>
			t.setValue(this.name).onChange((v) => (this.name = v))
		);
		new Setting(contentEl).setName("Type").addDropdown((d) => {
			EDITABLE_FIELD_TYPES.forEach((t) => d.addOption(t, t));
			d.setValue(this.type).onChange((v) => (this.type = v as FieldType));
		});

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
					this.opts.onSubmit({ name, type: this.type });
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
