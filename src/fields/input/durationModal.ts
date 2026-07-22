/*
 * Duration builder modal (#30). Number inputs for weeks/days/hours/minutes/
 * seconds composing an RFC 5545 DURATION, with a live compact preview. Pure
 * DURATION logic lives in src/fields/duration.ts; this is just the UI. Reused
 * per item by the MultiDuration list editor.
 */
import { App, Modal, Setting } from "obsidian";

import { buildDuration, DurationParts, formatDuration, parseDuration, ZERO_DURATION } from "../duration";

const UNITS: { key: keyof DurationParts; label: string }[] = [
	{ key: "weeks", label: "Weeks" },
	{ key: "days", label: "Days" },
	{ key: "hours", label: "Hours" },
	{ key: "minutes", label: "Minutes" },
	{ key: "seconds", label: "Seconds" },
];

export interface DurationModalOptions {
	title: string;
	initial: string;
	onSubmit: (value: string) => void;
}

export class DurationInputModal extends Modal {
	private parts: DurationParts;
	private previewEl!: HTMLElement;

	constructor(app: App, private readonly opts: DurationModalOptions) {
		super(app);
		this.parts = parseDuration(opts.initial) ?? { ...ZERO_DURATION };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });

		for (const { key, label } of UNITS) {
			new Setting(contentEl).setName(label).addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "0";
				t.setValue(String(this.parts[key])).onChange((v) => {
					this.parts[key] = Math.max(0, Math.trunc(Number(v)) || 0);
					this.refreshPreview();
				});
			});
		}

		contentEl.createDiv({ text: "Preview", cls: "setting-item-description" });
		this.previewEl = contentEl.createDiv({ cls: "fileclass-duration-preview" });
		this.refreshPreview();

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					this.opts.onSubmit(buildDuration(this.parts));
					this.close();
				})
		);
	}

	private refreshPreview(): void {
		this.previewEl.setText(formatDuration(buildDuration(this.parts)) || "—");
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export interface MultiDurationModalOptions {
	title: string;
	initial: string[];
	onSubmit: (values: string[]) => void;
}

/**
 * Ordered list editor for a MultiDuration field (#30): add / remove / reorder
 * durations, each entered through the DurationInputModal. The order is
 * meaningful — it is the interval sequence a linked date field cycles through.
 * Blank durations are dropped on save.
 */
export class MultiDurationEditorModal extends Modal {
	private readonly items: string[];

	constructor(app: App, private readonly opts: MultiDurationModalOptions) {
		super(app);
		this.items = [...opts.initial];
	}

	onOpen(): void {
		this.render();
	}

	private editItem(index: number): void {
		new DurationInputModal(this.app, {
			title: `${this.opts.title} — item ${index + 1}`,
			initial: this.items[index] ?? "",
			onSubmit: (v) => {
				this.items[index] = v;
				this.render();
			},
		}).open();
	}

	private move(index: number, delta: number): void {
		const target = index + delta;
		if (target < 0 || target >= this.items.length) return;
		[this.items[index], this.items[target]] = [this.items[target], this.items[index]];
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: this.opts.title });

		this.items.forEach((item, index) => {
			new Setting(contentEl)
				.setName(`Item ${index + 1}`)
				.setDesc(formatDuration(item) || "(empty)")
				.addExtraButton((b) =>
					b.setIcon("chevron-up").setTooltip("Move up").onClick(() => this.move(index, -1))
				)
				.addExtraButton((b) =>
					b.setIcon("chevron-down").setTooltip("Move down").onClick(() => this.move(index, 1))
				)
				.addButton((b) => b.setButtonText("Edit").onClick(() => this.editItem(index)))
				.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Remove")
						.onClick(() => {
							this.items.splice(index, 1);
							this.render();
						})
				);
		});

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Add duration").onClick(() => {
					this.items.push("");
					this.editItem(this.items.length - 1);
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.opts.onSubmit(this.items.filter((v) => v.trim() !== ""));
						this.close();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
