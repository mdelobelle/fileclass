/*
 * Reusable value-input modals for Wave A (ARCHITECTURE.md §7). Kept small and
 * generic: a text prompt, a single-choice suggester, and a multi-select toggle
 * list. Field-type wiring lives in fieldActions.ts.
 */
import { App, Modal, SuggestModal, Setting, TextAreaComponent, TextComponent } from "obsidian";

import { ValidationResult } from "../validate";

export interface PromptOptions {
	title: string;
	initial?: string;
	placeholder?: string;
	validate?: (value: string) => ValidationResult;
	onSubmit: (value: string) => void;
	/** Tweak the raw input element (e.g. type="number" with min/max/step). */
	configureInput?: (el: HTMLInputElement) => void;
}

/** Single-line text prompt with inline validation (Input/Number/Date/…). */
export class PromptModal extends Modal {
	constructor(app: App, private readonly opts: PromptOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });
		const errorEl = contentEl.createDiv();
		errorEl.setCssStyles({ color: "var(--text-error)", minHeight: "1.2em" });

		const input = new TextComponent(contentEl);
		input.setValue(this.opts.initial ?? "").setPlaceholder(this.opts.placeholder ?? "");
		input.inputEl.setCssStyles({ width: "100%" });
		this.opts.configureInput?.(input.inputEl);
		window.setTimeout(() => input.inputEl.focus(), 0);

		const submit = () => {
			const value = input.getValue();
			const result = this.opts.validate?.(value);
			if (result && !result.ok) {
				errorEl.setText(result.message ?? "Invalid value");
				return;
			}
			this.opts.onSubmit(value);
			this.close();
		};

		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save").setCta().onClick(submit)
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export interface TextAreaOptions {
	title: string;
	initial?: string;
	placeholder?: string;
	validate?: (value: string) => ValidationResult;
	onSubmit: (value: string) => void;
}

/** Multi-line input with inline validation (JSON/YAML). Cmd/Ctrl+Enter saves. */
export class TextAreaInputModal extends Modal {
	constructor(app: App, private readonly opts: TextAreaOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });
		const errorEl = contentEl.createDiv();
		errorEl.setCssStyles({
			color: "var(--text-error)",
			minHeight: "1.2em",
			whiteSpace: "pre-wrap",
		});

		const input = new TextAreaComponent(contentEl);
		input.setValue(this.opts.initial ?? "").setPlaceholder(this.opts.placeholder ?? "");
		input.inputEl.rows = 10;
		input.inputEl.setCssStyles({ width: "100%", fontFamily: "var(--font-monospace)" });
		window.setTimeout(() => input.inputEl.focus(), 0);

		const submit = () => {
			const value = input.getValue();
			const result = this.opts.validate?.(value);
			if (result && !result.ok) {
				errorEl.setText(result.message ?? "Invalid value");
				return;
			}
			this.opts.onSubmit(value);
			this.close();
		};

		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				submit();
			}
		});
		new Setting(contentEl)
			.setDesc("Cmd/Ctrl+Enter to save")
			.addButton((b) => b.setButtonText("Save").setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Boolean input: a real toggle (like MDM) plus Save; Enter confirms. */
export class BooleanInputModal extends Modal {
	constructor(
		app: App,
		private readonly opts: { title: string; initial: boolean; onSubmit: (value: boolean) => void }
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });

		let value = this.opts.initial;
		const submit = () => {
			this.opts.onSubmit(value);
			this.close();
		};
		new Setting(contentEl)
			.setName("Value")
			.addToggle((t) => t.setValue(value).onChange((v) => (value = v)));
		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save").setCta().onClick(submit)
		);
		this.scope.register([], "Enter", (e) => {
			e.preventDefault();
			submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Generic single-choice suggester (Select/Cycle/Boolean). */
export class ChoiceSuggestModal<T> extends SuggestModal<T> {
	constructor(
		app: App,
		private readonly choices: T[],
		private readonly toText: (choice: T) => string,
		private readonly onPick: (choice: T) => void,
		placeholder = "Select a value"
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getSuggestions(query: string): T[] {
		const q = query.toLowerCase();
		return this.choices.filter((c) => this.toText(c).toLowerCase().includes(q));
	}

	renderSuggestion(choice: T, el: HTMLElement): void {
		el.setText(this.toText(choice));
	}

	onChooseSuggestion(choice: T): void {
		this.onPick(choice);
	}
}

export interface MultiSelectOptions {
	title: string;
	allowed: string[];
	selected: string[];
	onSubmit: (values: string[]) => void;
}

/** Toggle list for Multi fields over a constrained set of values. */
export class MultiSelectModal extends Modal {
	private readonly selected: Set<string>;

	constructor(app: App, private readonly opts: MultiSelectOptions) {
		super(app);
		this.selected = new Set(opts.selected);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });
		// Preserve allowed order, then any already-selected extras.
		const options = [...new Set([...this.opts.allowed, ...this.opts.selected])];
		for (const value of options) {
			new Setting(contentEl).setName(value).addToggle((t) =>
				t.setValue(this.selected.has(value)).onChange((on) => {
					if (on) this.selected.add(value);
					else this.selected.delete(value);
				})
			);
		}
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					this.opts.onSubmit(options.filter((v) => this.selected.has(v)));
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
