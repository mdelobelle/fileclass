/*
 * In-app bulk field edit (#56): a set-where UI over the proven API engine
 * (`previewValueWhere`/`applyValueToPaths`). Two steps:
 *   1. BulkEditModal — pick a fileClass, an optional filter (a field condition
 *      or a base view), a field and a new value (through the field's own typed
 *      input); CTA "Preview".
 *   2. BulkPreviewModal — the full list of would-be changes, each with a toggle
 *      (default on); CTA "Apply (N)" writes only the kept rows.
 * Dry-run by default: nothing is written until Apply in step 2.
 */
import { App, Modal, Notice, Setting, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { BulkChange, BulkPreview, BulkScope } from "../api/fileclassApi";
import { Filter, FilterOp } from "../api/filter";
import { displayValue } from "../fields/display";
import { EditContext, promptFieldValue } from "../fields/fieldActions";
import { logEvent } from "../log/schemaLog";
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
				this.render();
			});
		});

		this.renderFilter(contentEl);
		this.renderTarget(contentEl);
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
					this.render();
				});
			});

		if (this.filterMode === "condition") {
			const fields = this.rootFields();
			new Setting(contentEl).setClass("fileclass-bulk-sub").setName("Where").addDropdown((d) => {
				d.addOption("", "— field —");
				for (const f of fields) d.addOption(f.name, f.name);
				d.setValue(this.condField).onChange((v) => (this.condField = v));
			});
			new Setting(contentEl).setClass("fileclass-bulk-sub").setName("Condition").addDropdown((d) => {
				for (const op of Object.keys(OP_LABELS) as FilterOp[]) d.addOption(op, OP_LABELS[op]);
				d.setValue(this.condOp).onChange((v) => {
					this.condOp = v as FilterOp;
					this.render();
				});
			});
			if (OPS_WITH_VALUE.includes(this.condOp)) {
				new Setting(contentEl).setClass("fileclass-bulk-sub").setName("Value").addText((t) =>
					t.setValue(this.condValue).onChange((v) => (this.condValue = v))
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
					t.setValue(this.baseFile).onChange((v) => (this.baseFile = v));
					new BaseFileSuggest(this.app, t.inputEl);
				});
			new Setting(contentEl)
				.setClass("fileclass-bulk-sub")
				.setName("View")
				.setDesc("Leave empty for the base's first view.")
				.addText((t) => {
					t.setValue(this.viewName).onChange((v) => (this.viewName = v));
					new BaseViewSuggest(this.app, t.inputEl, () => this.baseFile.trim());
				});
		}
	}

	private renderTarget(contentEl: HTMLElement): void {
		const fields = this.rootFields();
		new Setting(contentEl).setName("Field to set").addDropdown((d) => {
			d.addOption("", "— field —");
			for (const f of fields) d.addOption(f.name, `${f.name} (${f.type})`);
			d.setValue(this.field).onChange((v) => {
				this.field = v;
				this.valueSet = false;
				this.value = undefined;
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

	private renderFooter(contentEl: HTMLElement): void {
		const footer = makeStickyFooter(contentEl);
		const field = this.targetField();
		const ready = !!field && this.valueSet;
		new Setting(footer).addButton((b) =>
			b
				.setButtonText("Preview")
				.setCta()
				.setDisabled(!ready)
				.onClick(() => void this.preview())
		);
	}

	private async preview(): Promise<void> {
		const field = this.targetField();
		if (!field || !this.valueSet) return;
		const preview = await this.plugin.api.previewValueWhere(this.buildScope(), field.name, this.value);
		if (!preview.changes.length) {
			new Notice(
				`Fileclass: nothing to change (${preview.willSkip} already set, ${preview.errors.length} error(s), ${preview.total} matched).`
			);
			return;
		}
		new BulkPreviewModal(this.app, {
			field,
			preview,
			apply: async (paths) => {
				const result = await this.plugin.api.applyValueToPaths(paths, field.name, this.value);
				// A value written into notes nobody had open — the rule for INFO.
				void logEvent(
					this.plugin,
					"INFO",
					"schema.bulk-edit",
					`${field.fileClassName} › ${field.name}: set in ${result.changed} note(s)`,
					{
						fileClass: field.fileClassName,
						field: field.name,
						notes: result.changed,
						skipped: result.skipped,
						errors: result.errors.length,
					}
				);
				return result;
			},
			onApplied: () => this.close(),
		}).open();
	}
}

interface BulkPreviewOptions {
	field: Field;
	preview: BulkPreview;
	apply: (paths: string[]) => Promise<{ ok: boolean; changed: number; skipped: number; errors: unknown[] }>;
	/** Closes the step-1 modal once the write succeeds. */
	onApplied: () => void;
}

/** Step 2: the full change list with per-note toggles; Apply writes the kept rows. */
class BulkPreviewModal extends Modal {
	private readonly enabled: Set<string>;
	private applyBtn?: HTMLButtonElement;
	private countEl?: HTMLElement;

	constructor(app: App, private readonly opts: BulkPreviewOptions) {
		super(app);
		this.enabled = new Set(opts.preview.changes.map((c) => c.path));
	}

	onOpen(): void {
		const { contentEl } = this;
		const { preview } = this.opts;
		modalTitle(contentEl, "Bulk edit — preview");

		this.countEl = contentEl.createDiv({ cls: "fileclass-bulk-summary" });
		contentEl.createDiv({
			cls: "setting-item-description",
			text: `${preview.willSkip} already at the value · ${preview.errors.length} error(s) · ${preview.total} matched`,
		});

		// Select all / none.
		new Setting(contentEl).setName("Include all").addToggle((t) =>
			t.setValue(true).onChange((on) => this.toggleAll(on))
		);

		const list = contentEl.createDiv({ cls: "fileclass-bulk-list" });
		for (const change of preview.changes) this.renderRow(list, change);

		for (const e of preview.errors.slice(0, 8)) {
			const err = e as { path: string; message?: string };
			contentEl.createDiv({ cls: "fileclass-bulk-error", text: `${err.path}: ${err.message ?? ""}` });
		}

		const footer = makeStickyFooter(contentEl);
		new Setting(footer)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => {
				this.applyBtn = b.setCta().onClick(() => void this.apply()).buttonEl;
				return b;
			});
		this.updateCount();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderRow(list: HTMLElement, change: BulkChange): void {
		const { field } = this.opts;
		const row = list.createEl("label", { cls: "fileclass-bulk-row" });
		const cb = row.createEl("input", { attr: { type: "checkbox" } });
		cb.checked = true;
		cb.addEventListener("change", () => {
			if (cb.checked) this.enabled.add(change.path);
			else this.enabled.delete(change.path);
			this.updateCount();
		});
		const from = displayValue(field, change.from) || "(empty)";
		const to = displayValue(field, change.to) || "(empty)";
		row.createSpan({ cls: "fileclass-bulk-rowtext", text: `${change.path}:  ${from} → ${to}` });
		row.dataset.path = change.path;
	}

	private toggleAll(on: boolean): void {
		this.enabled.clear();
		const boxes = this.contentEl.querySelectorAll<HTMLInputElement>(".fileclass-bulk-row input");
		this.contentEl.querySelectorAll<HTMLElement>(".fileclass-bulk-row").forEach((row, i) => {
			const box = boxes[i];
			if (box) box.checked = on;
			if (on && row.dataset.path) this.enabled.add(row.dataset.path);
		});
		this.updateCount();
	}

	private updateCount(): void {
		const n = this.enabled.size;
		if (this.countEl) this.countEl.setText(`${n} note(s) will be updated`);
		if (this.applyBtn) {
			this.applyBtn.setText(`Apply (${n})`);
			this.applyBtn.toggleAttribute("disabled", n === 0);
		}
	}

	private async apply(): Promise<void> {
		const paths = [...this.enabled];
		if (!paths.length) return;
		const result = await this.opts.apply(paths);
		if (result.ok) new Notice(`Fileclass: updated ${result.changed} note(s).`);
		else
			new Notice(
				`Fileclass: updated ${result.changed}, ${result.errors.length} error(s), ${result.skipped} unchanged.`
			);
		this.close();
		this.opts.onApplied();
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
