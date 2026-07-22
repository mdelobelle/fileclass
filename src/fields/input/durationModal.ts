/*
 * Duration builder modal (#30). Number inputs for weeks/days/hours/minutes/
 * seconds composing an RFC 5545 DURATION, with a live compact preview. Pure
 * DURATION logic lives in src/fields/duration.ts; this is just the UI. Reused
 * per item by the MultiDuration list editor.
 */
import { App, Modal, Setting, TextComponent } from "obsidian";

import {
	buildDuration,
	DurationParts,
	formatDuration,
	parseDurationInput,
	ZERO_DURATION,
} from "../duration";

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
	private freeText!: TextComponent;
	private readonly spinners = new Map<keyof DurationParts, TextComponent>();
	private previewEl!: HTMLElement;
	private errorEl!: HTMLElement;

	constructor(app: App, private readonly opts: DurationModalOptions) {
		super(app);
		this.parts = parseDurationInput(opts.initial) ?? { ...ZERO_DURATION };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });

		// Free-text entry: type ISO (PT1H30M) or a human form (1h 30m, 2w).
		new Setting(contentEl)
			.setName("Duration")
			.setDesc('Type it, e.g. "1h 30m", "2w", or ISO "PT1H30M" — or use the fields below.')
			.addText((t) => {
				this.freeText = t;
				t.setPlaceholder("1h 30m").setValue(buildDuration(this.parts));
				t.onChange((v) => this.onFreeText(v));
				window.setTimeout(() => t.inputEl.focus(), 0);
			});
		this.errorEl = contentEl.createDiv({ cls: "setting-item-description" });
		this.errorEl.setCssStyles({ color: "var(--text-error)", minHeight: "1.2em" });

		for (const { key, label } of UNITS) {
			new Setting(contentEl).setName(label).addText((t) => {
				this.spinners.set(key, t);
				t.inputEl.type = "number";
				t.inputEl.min = "0";
				t.setValue(String(this.parts[key])).onChange((v) => this.onSpinner(key, v));
			});
		}

		contentEl.createDiv({ text: "Preview", cls: "setting-item-description" });
		this.previewEl = contentEl.createDiv({ cls: "fileclass-duration-preview" });
		this.refreshPreview();

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save").setCta().onClick(() => this.submit())
		);
	}

	/** Free-text changed: parse (ISO or human), sync spinners + preview, or flag. */
	private onFreeText(value: string): void {
		const raw = value.trim();
		if (!raw) {
			this.parts = { ...ZERO_DURATION };
			this.syncSpinners();
			this.setError("");
			this.refreshPreview();
			return;
		}
		const parsed = parseDurationInput(raw);
		if (!parsed) {
			this.setError("Not a valid duration.");
			return;
		}
		this.parts = parsed;
		this.syncSpinners();
		this.setError("");
		this.refreshPreview();
	}

	/** A spinner changed: update parts and reflect the canonical ISO in the text. */
	private onSpinner(key: keyof DurationParts, value: string): void {
		this.parts[key] = Math.max(0, Math.trunc(Number(value)) || 0);
		this.freeText.setValue(buildDuration(this.parts)); // setValue doesn't refire onChange
		this.setError("");
		this.refreshPreview();
	}

	private syncSpinners(): void {
		for (const [key, comp] of this.spinners) comp.setValue(String(this.parts[key]));
	}

	private refreshPreview(): void {
		this.previewEl.setText(formatDuration(buildDuration(this.parts)) || "—");
	}

	private setError(message: string): void {
		this.errorEl.setText(message);
	}

	private submit(): void {
		const raw = this.freeText.getValue().trim();
		if (raw && !parseDurationInput(raw)) {
			this.setError("Not a valid duration.");
			return;
		}
		this.opts.onSubmit(buildDuration(this.parts));
		this.close();
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
