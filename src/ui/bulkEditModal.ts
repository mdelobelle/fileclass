/*
 * In-app bulk field edit (#56): a set-where UI over the proven API engine
 * (`previewValueWhere`/`applyValueWhere`). Pick a fileClass, an optional filter
 * (a simple field condition or a base view), a field and a new value (through
 * the field's own typed input), preview the affected notes (dry-run), then
 * apply. Dry-run by default: Apply is only enabled after a matching preview.
 */
import { Modal, Notice, Setting, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { BulkPreview, BulkScope } from "../api/fileclassApi";
import { Filter, FilterOp } from "../api/filter";
import { displayValue } from "../fields/display";
import { EditContext, promptFieldValue } from "../fields/fieldActions";
import { Field, isRootField } from "../schema/field";
import { BaseFileSuggest, BaseViewSuggest } from "./baseSuggest";
import { makeStickyFooter } from "./modalFooter";
import { modalTitle } from "./modalTitle";

type FilterMode = "none" | "condition" | "base";

const OP_LABELS: Record<FilterOp, string> = {
	is: "is",
	isNot: "is not",
	contains: "contains",
	isEmpty: "is empty",
	isNotEmpty: "is not empty",
};
const OPS_WITH_VALUE: FilterOp[] = ["is", "isNot", "contains"];

export class BulkEditModal extends Modal {
	private fileClass: string;
	private filterMode: FilterMode = "none";
	private condField = "";
	private condOp: FilterOp = "is";
	private condValue = "";
	private baseFile = "";
	private viewName = "";
	private field = "";
	private value: unknown;
	private valueSet = false;
	private preview?: BulkPreview;

	constructor(private readonly plugin: FileclassPlugin, initialFileClass?: string) {
		super(plugin.app);
		const names = plugin.index.fileClassNames;
		this.fileClass = initialFileClass && names.includes(initialFileClass) ? initialFileClass : names[0] ?? "";
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Root fields of the current fileClass (both the filter and the target use them). */
	private rootFields(): Field[] {
		return this.fileClass
			? this.plugin.index.getResolvedFields(this.fileClass).filter((f) => isRootField(f))
			: [];
	}

	private targetField(): Field | undefined {
		return this.rootFields().find((f) => f.name === this.field);
	}

	/** Invalidate a stale dry-run whenever the selection changes. */
	private invalidate(): void {
		this.preview = undefined;
	}

	private buildScope(): BulkScope {
		const scope: BulkScope = { fileClass: this.fileClass };
		if (this.filterMode === "condition" && this.condField) {
			const filter: Filter = { field: this.condField, op: this.condOp };
			if (OPS_WITH_VALUE.includes(this.condOp)) filter.value = this.condValue;
			scope.where = filter;
		} else if (this.filterMode === "base" && this.baseFile.trim()) {
			scope.baseFile = this.baseFile.trim();
			if (this.viewName.trim()) scope.viewName = this.viewName.trim();
		}
		return scope;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		modalTitle(contentEl, "Bulk edit a field");

		const names = this.plugin.index.fileClassNames;
		if (!names.length) {
			contentEl.createEl("p", { text: "No fileClasses are defined." });
			return;
		}

		new Setting(contentEl).setName("Fileclass").addDropdown((d) => {
			for (const n of [...names].sort()) d.addOption(n, n);
			d.setValue(this.fileClass).onChange((v) => {
				this.fileClass = v;
				this.field = "";
				this.condField = "";
				this.valueSet = false;
				this.value = undefined;
				this.invalidate();
				this.render();
			});
		});

		this.renderFilter(contentEl);
		this.renderTarget(contentEl);
		this.renderPreview(contentEl);
		this.renderFooter(contentEl);
	}

	private renderFilter(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("Filter")
			.setDesc("Which notes of this fileClass to edit.")
			.addDropdown((d) => {
				d.addOption("none", "All notes");
				d.addOption("condition", "Field condition");
				d.addOption("base", "Base view");
				d.setValue(this.filterMode).onChange((v) => {
					this.filterMode = v as FilterMode;
					this.invalidate();
					this.render();
				});
			});

		if (this.filterMode === "condition") {
			const fields = this.rootFields();
			new Setting(contentEl).setClass("fileclass-bulk-sub").setName("Where").addDropdown((d) => {
				d.addOption("", "— field —");
				for (const f of fields) d.addOption(f.name, f.name);
				d.setValue(this.condField).onChange((v) => {
					this.condField = v;
					this.invalidate();
				});
			});
			new Setting(contentEl).setClass("fileclass-bulk-sub").setName("Condition").addDropdown((d) => {
				for (const op of Object.keys(OP_LABELS) as FilterOp[]) d.addOption(op, OP_LABELS[op]);
				d.setValue(this.condOp).onChange((v) => {
					this.condOp = v as FilterOp;
					this.invalidate();
					this.render();
				});
			});
			if (OPS_WITH_VALUE.includes(this.condOp)) {
				new Setting(contentEl).setClass("fileclass-bulk-sub").setName("Value").addText((t) =>
					t.setValue(this.condValue).onChange((v) => {
						this.condValue = v;
						this.invalidate();
					})
				);
			}
		} else if (this.filterMode === "base") {
			if (!this.plugin.basesAvailable) {
				new Setting(contentEl)
					.setClass("fileclass-bulk-sub")
					.setDesc("The core Bases plugin is unavailable, so a base-view filter can't be applied.");
				return;
			}
			new Setting(contentEl)
				.setClass("fileclass-bulk-sub")
				.setName("Base file")
				.addText((t) => {
					t.setValue(this.baseFile).onChange((v) => {
						this.baseFile = v;
						this.invalidate();
					});
					new BaseFileSuggest(this.app, t.inputEl);
				});
			new Setting(contentEl)
				.setClass("fileclass-bulk-sub")
				.setName("View")
				.setDesc("Leave empty for the base's first view.")
				.addText((t) => {
					t.setValue(this.viewName).onChange((v) => {
						this.viewName = v;
						this.invalidate();
					});
					new BaseViewSuggest(this.app, t.inputEl, () => this.baseFile.trim());
				});
		}
	}

	private renderTarget(contentEl: HTMLElement): void {
		const fields = this.rootFields();
		new Setting(contentEl)
			.setName("Field to set")
			.addDropdown((d) => {
				d.addOption("", "— field —");
				for (const f of fields) d.addOption(f.name, `${f.name} (${f.type})`);
				d.setValue(this.field).onChange((v) => {
					this.field = v;
					this.valueSet = false;
					this.value = undefined;
					this.invalidate();
					this.render();
				});
			});

		const field = this.targetField();
		if (!field) return;
		new Setting(contentEl)
			.setName("New value")
			.setDesc(this.valueSet ? displayValue(field, this.value) || "(empty)" : "Not set yet.")
			.addButton((b) =>
				b.setButtonText(this.valueSet ? "Change…" : "Set value…").onClick(() => this.editValue(field))
			);
	}

	/** Opens the field's own typed input to choose the new value. */
	private editValue(field: Field): void {
		const file = this.representativeFile();
		if (!file) {
			new Notice("Fileclass: no note available to base the value input on.");
			return;
		}
		const ctx: EditContext = {
			host: this.plugin,
			file,
			allFields: this.plugin.index.getResolvedFields(this.fileClass),
		};
		void promptFieldValue(ctx, field, this.value, (v) => {
			this.value = v;
			this.valueSet = true;
			this.invalidate();
			this.render();
		});
	}

	/** A bound note used as `this.file` context for the value input (else the fileClass note). */
	private representativeFile(): TFile | null {
		const bound = this.app.vault
			.getMarkdownFiles()
			.find((f) => this.plugin.index.getFileClasses(f).includes(this.fileClass));
		return bound ?? this.plugin.index.getFileClassFile(this.fileClass) ?? null;
	}

	private renderPreview(contentEl: HTMLElement): void {
		const p = this.preview;
		if (!p) return;
		const box = contentEl.createDiv({ cls: "fileclass-bulk-preview" });
		box.createDiv({
			cls: "fileclass-bulk-summary",
			text: `${p.willChange} to change · ${p.willSkip} unchanged · ${p.errors.length} error(s) · ${p.total} matched`,
		});
		const field = this.targetField();
		for (const row of p.sample) {
			const from = field ? displayValue(field, row.from) : String(row.from ?? "");
			const to = field ? displayValue(field, row.to) : String(row.to ?? "");
			box.createDiv({
				cls: "fileclass-bulk-sample",
				text: `${row.path}:  ${from || "(empty)"} → ${to || "(empty)"}`,
			});
		}
		if (p.willChange > p.sample.length) {
			box.createDiv({
				cls: "fileclass-bulk-sample",
				text: `…and ${p.willChange - p.sample.length} more`,
			});
		}
		for (const e of p.errors.slice(0, 5)) {
			box.createDiv({ cls: "fileclass-bulk-error", text: `${e.path}: ${e.message}` });
		}
	}

	private renderFooter(contentEl: HTMLElement): void {
		const footer = makeStickyFooter(contentEl);
		const ready = !!this.targetField() && this.valueSet;
		const canApply = !!this.preview && this.preview.willChange > 0;
		new Setting(footer)
			.addButton((b) =>
				b
					.setButtonText("Preview")
					.setDisabled(!ready)
					.onClick(() => void this.runPreview())
			)
			.addButton((b) =>
				b
					.setButtonText(`Apply${canApply ? ` (${this.preview?.willChange})` : ""}`)
					.setCta()
					.setDisabled(!canApply)
					.onClick(() => void this.apply())
			);
	}

	private async runPreview(): Promise<void> {
		const field = this.targetField();
		if (!field || !this.valueSet) return;
		this.preview = await this.plugin.api.previewValueWhere(this.buildScope(), field.name, this.value);
		this.render();
	}

	private async apply(): Promise<void> {
		const field = this.targetField();
		if (!field || !this.preview || this.preview.willChange === 0) return;
		const result = await this.plugin.api.applyValueWhere(this.buildScope(), field.name, this.value);
		if (result.ok) new Notice(`Fileclass: updated ${result.changed} note(s).`);
		else
			new Notice(
				`Fileclass: updated ${result.changed}, ${result.errors.length} error(s), ${result.skipped} unchanged.`
			);
		this.close();
	}
}

/** Opens the bulk-edit modal, optionally pre-selecting a fileClass. */
export function openBulkEdit(plugin: FileclassPlugin, fileClass?: string): void {
	if (!plugin.index.fileClassNames.length) {
		new Notice("Fileclass: no fileClasses defined.");
		return;
	}
	new BulkEditModal(plugin, fileClass).open();
}
