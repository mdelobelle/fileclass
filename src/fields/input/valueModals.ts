/*
 * Reusable value-input modals for Wave A (ARCHITECTURE.md §7). Kept small and
 * generic: a text prompt, a single-choice suggester, and a multi-select toggle
 * list. Field-type wiring lives in fieldActions.ts.
 */
import { App, Modal, SuggestModal, Setting, TextAreaComponent, TextComponent } from "obsidian";

import { makeStickyFooter } from "../../ui/modalFooter";
import { modalTitle } from "../../ui/modalTitle";

import { DisplayGroup, groupLabel } from "../baseOrder";
import { parseTemplate, renderTemplate } from "../inputTemplate";
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
		modalTitle(contentEl, this.opts.title);
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
		modalTitle(contentEl, this.opts.title);
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

export interface TemplateInputOptions {
	title: string;
	/** The Input field's `template` option, e.g. `pg. {{page}}`. */
	template: string;
	initial?: string;
	onSubmit: (value: string) => void;
}

/**
 * Guided input for an Input field with a `template` option (#27): one control
 * per placeholder (text or dropdown) plus a live, editable result preview. The
 * stored value is the rendered scalar. Ported from Metadata Menu's Input modal.
 */
export class TemplateInputModal extends Modal {
	private readonly values: Record<string, string> = {};
	private preview!: TextAreaComponent;

	constructor(app: App, private readonly opts: TemplateInputOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		modalTitle(contentEl, this.opts.title);

		for (const part of parseTemplate(this.opts.template)) {
			this.values[part.name] = "";
			const row = new Setting(contentEl).setName(part.name);
			if (part.choices) {
				const choices = part.choices;
				row.addDropdown((d) => {
					d.addOption("", "--select--");
					for (const c of choices) d.addOption(c, c);
					d.onChange((v) => this.onPartChange(part.name, v));
				});
			} else {
				if (part.choicesError) row.setDesc(`Invalid choices JSON (${part.choicesError}); free text.`);
				row.addText((t) =>
					t
						.setPlaceholder(`Value for ${part.name}`)
						.onChange((v) => this.onPartChange(part.name, v))
				);
			}
		}

		contentEl.createDiv({ text: "Result preview", cls: "setting-item-description" });
		this.preview = new TextAreaComponent(contentEl);
		this.preview.inputEl.rows = 3;
		this.preview.inputEl.setCssStyles({ width: "100%" });
		this.preview.setValue(this.opts.initial ?? "");

		new Setting(contentEl)
			.setDesc("Cmd/Ctrl+Enter to save")
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit()));
		this.scope.register(["Mod"], "Enter", (e) => {
			e.preventDefault();
			this.submit();
		});
	}

	private onPartChange(name: string, value: string): void {
		this.values[name] = value;
		// The preview stays editable; controls just refresh it from the template.
		this.preview.setValue(renderTemplate(this.opts.template, this.values));
	}

	private submit(): void {
		this.opts.onSubmit(this.preview.getValue());
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export interface MultiInputOptions {
	title: string;
	/** The field's `template` option; when set, each item uses the guided form. */
	template?: string;
	initial: string[];
	onSubmit: (values: string[]) => void;
}

/**
 * List editor for a MultiInput field (#28): add / remove / reorder items, each
 * entered through the same templated sub-form as Input (or a plain prompt when
 * no template is set). Stores a YAML list of scalars; blank items are dropped on
 * save. Mirrors the ObjectList editor's add/reorder UX for scalars.
 */
export class MultiInputEditorModal extends Modal {
	private readonly items: string[];

	constructor(app: App, private readonly opts: MultiInputOptions) {
		super(app);
		this.items = [...opts.initial];
	}

	onOpen(): void {
		this.render();
	}

	private editItem(index: number): void {
		const current = this.items[index] ?? "";
		const onValue = (value: string) => {
			this.items[index] = value;
			this.render();
		};
		const title = `${this.opts.title} — item ${index + 1}`;
		if (this.opts.template) {
			new TemplateInputModal(this.app, {
				title,
				template: this.opts.template,
				initial: current,
				onSubmit: onValue,
			}).open();
		} else {
			new PromptModal(this.app, { title, initial: current, onSubmit: onValue }).open();
		}
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
		modalTitle(contentEl, this.opts.title);

		this.items.forEach((item, index) => {
			new Setting(contentEl)
				.setName(`Item ${index + 1}`)
				.setDesc(item || "(empty)")
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
				b.setButtonText("Add item").onClick(() => {
					this.items.push("");
					this.editItem(this.items.length - 1);
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.opts.onSubmit(this.items.map((v) => v.trim()).filter((v) => v !== ""));
						this.close();
					})
			);
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
		modalTitle(contentEl, this.opts.title);

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

/**
 * Generic single-choice suggester (Select/Cycle/File/Media). With `groupOf`, it
 * shows the source view's groups (#47): an inline header before the first item
 * of each group (delimiters that survive filtering) plus a sticky bar over the
 * top of the list naming the group you're currently scrolled into. `groupOf`
 * returns a group key (`null` = the keyless group) or `undefined` to skip.
 */
export class ChoiceSuggestModal<T> extends SuggestModal<T> {
	private results: T[] = [];
	private groupBar?: HTMLElement;
	private readonly onScroll = () => this.updateGroupBar();

	constructor(
		app: App,
		private readonly choices: T[],
		private readonly toText: (choice: T) => string,
		private readonly onPick: (choice: T) => void,
		placeholder = "Select a value",
		private readonly groupOf?: (choice: T) => string | null | undefined
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		super.onOpen();
		if (!this.groupOf) return;
		// A sticky "current group" bar overlaid on the top of the scrolling
		// results. Lives in the prompt (a sibling of the results), so it never
		// interferes with the suggestion items or their keyboard navigation.
		const prompt = this.resultContainerEl.parentElement;
		if (!prompt) return;
		prompt.style.position = "relative";
		this.groupBar = prompt.createDiv({ cls: "fileclass-suggest-groupbar" });
		this.groupBar.hide();
		this.resultContainerEl.addEventListener("scroll", this.onScroll);
	}

	onClose(): void {
		this.resultContainerEl.removeEventListener("scroll", this.onScroll);
		super.onClose();
	}

	getSuggestions(query: string): T[] {
		const q = query.toLowerCase();
		this.results = this.choices.filter((c) => this.toText(c).toLowerCase().includes(q));
		// renderSuggestion runs after this returns; refresh the bar once it has.
		if (this.groupOf) window.setTimeout(() => this.updateGroupBar(), 0);
		return this.results;
	}

	renderSuggestion(choice: T, el: HTMLElement): void {
		if (this.groupOf) {
			const i = this.results.indexOf(choice);
			const group = this.groupOf(choice);
			const prev = i > 0 ? this.groupOf(this.results[i - 1]) : undefined;
			if (group !== undefined && (i <= 0 || group !== prev)) {
				el.createDiv({ text: groupLabel(group), cls: "fileclass-group-header" });
			}
			el.createDiv({ text: this.toText(choice) });
			return;
		}
		el.setText(this.toText(choice));
	}

	/** Names the group whose section currently sits at the top of the results. */
	private updateGroupBar(): void {
		const bar = this.groupBar;
		if (!bar || !this.groupOf) return;
		const container = this.resultContainerEl;
		const items = container.querySelectorAll<HTMLElement>(".suggestion-item");
		if (!items.length) {
			bar.hide();
			return;
		}
		bar.style.top = `${container.offsetTop}px`;
		const top = container.getBoundingClientRect().top;
		let key: string | null | undefined;
		for (let i = 0; i < items.length && i < this.results.length; i++) {
			if (items[i].getBoundingClientRect().top - top <= 1) key = this.groupOf(this.results[i]);
			else break;
		}
		if (key === undefined) key = this.groupOf(this.results[0]);
		if (key === undefined) {
			bar.hide();
			return;
		}
		bar.setText(groupLabel(key));
		bar.show();
		// Reserve the bar's height at the top of the list so it never hides the
		// first row (the bar is overlaid, not in flow).
		if (!container.style.paddingTop) container.style.paddingTop = `${bar.offsetHeight}px`;
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
	/**
	 * Optional group headers over `allowed` (#47), in display order. Values not
	 * covered by a group (e.g. already-selected extras) render under a trailing
	 * "(Other)" header.
	 */
	groups?: DisplayGroup[];
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
		const title = modalTitle(contentEl, this.opts.title);
		// Sticky group headers park just below the sticky title — offset by its height.
		contentEl.style.setProperty("--fc-title-h", `${title.offsetHeight}px`);
		// Preserve allowed order, then any already-selected extras.
		const options = [...new Set([...this.opts.allowed, ...this.opts.selected])];

		const groups = this.opts.groups;
		if (groups && groups.length) {
			const rendered = new Set<string>();
			for (const g of groups) {
				const values = g.values.filter((v) => options.includes(v));
				if (!values.length) continue;
				this.renderGroupHeader(contentEl, groupLabel(g.key));
				for (const v of values) {
					this.renderToggle(contentEl, v);
					rendered.add(v);
				}
			}
			const extras = options.filter((v) => !rendered.has(v));
			if (extras.length) {
				this.renderGroupHeader(contentEl, "(Other)");
				for (const v of extras) this.renderToggle(contentEl, v);
			}
		} else {
			for (const v of options) this.renderToggle(contentEl, v);
		}

		const footer = makeStickyFooter(contentEl);
		new Setting(footer).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					this.opts.onSubmit(options.filter((v) => this.selected.has(v)));
					this.close();
				})
		);
	}

	private renderToggle(container: HTMLElement, value: string): void {
		new Setting(container).setName(value).addToggle((t) =>
			t.setValue(this.selected.has(value)).onChange((on) => {
				if (on) this.selected.add(value);
				else this.selected.delete(value);
			})
		);
	}

	private renderGroupHeader(container: HTMLElement, label: string): void {
		// Sticky so the current group stays visible while the list scrolls.
		container.createDiv({ text: label, cls: "fileclass-group-header fileclass-group-sticky" });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
