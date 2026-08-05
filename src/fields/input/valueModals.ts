/*
 * Reusable value-input modals for Wave A (ARCHITECTURE.md §7). Kept small and
 * generic: a text prompt, a single-choice suggester, and a multi-select toggle
 * list. Field-type wiring lives in fieldActions.ts.
 */
import {
	App,
	Modal,
	setIcon,
	SuggestModal,
	Setting,
	TextAreaComponent,
	TextComponent,
	ToggleComponent,
} from "obsidian";

import { makeStickyFooter } from "../../ui/modalFooter";
import { modalTitle } from "../../ui/modalTitle";
import { returnFocusTo } from "../../ui/listKeyboard";
import { attachUnsavedGuard } from "../../ui/unsavedGuard";

import { DisplayGroup, groupLabel } from "../baseOrder";
import { matchTemplate, parseTemplate, renderTemplate } from "../inputTemplate";
import { stepNumber, stepSize } from "../numberStep";
import { NumberOptions } from "../options";
import { ValidationResult } from "../validate";

export interface PromptOptions {
	title: string;
	initial?: string;
	placeholder?: string;
	validate?: (value: string) => ValidationResult;
	onSubmit: (value: string) => void;
	/** Tweak the raw input element (inputMode, autocomplete, …). */
	configureInput?: (el: HTMLInputElement) => void;
	/**
	 * Adds − / + buttons (and ↑/↓ keys) stepping by `step`. Numeric fields use
	 * this instead of `type="number"`: a native number input silently swallows
	 * every non-numeric keystroke, so a typo produced an empty field and no
	 * explanation, while the field's own validation never got to speak.
	 */
	stepper?: NumberOptions;
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

		// A stepper needs the input and its buttons on one row; without one the
		// input keeps the full width it always had.
		const row = this.opts.stepper ? contentEl.createDiv() : contentEl;
		if (this.opts.stepper) {
			row.setCssStyles({ display: "flex", gap: "6px", alignItems: "center" });
		}

		const input = new TextComponent(row);
		input.setValue(this.opts.initial ?? "").setPlaceholder(this.opts.placeholder ?? "");
		input.inputEl.setCssStyles({ width: "100%", flex: "1" });
		this.opts.configureInput?.(input.inputEl);
		if (this.opts.stepper) this.addStepper(row, input, this.opts.stepper);
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
			if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				submit();
			}
		});
		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save").setCta().onClick(submit)
		);
	}

	/**
	 * − / + buttons and the ↑/↓ keys, both stepping by `stepNumber`. The buttons
	 * keep focus in the field so a click can be followed by typing.
	 */
	private addStepper(row: HTMLElement, input: TextComponent, bounds: NumberOptions): void {
		const step = (direction: 1 | -1) => {
			input.setValue(String(stepNumber(input.getValue(), bounds, direction)));
			input.inputEl.focus();
		};
		const button = (label: string, direction: 1 | -1, title: string) => {
			const el = row.createEl("button", { text: label, attr: { type: "button", "aria-label": title } });
			el.setAttr("title", title);
			el.addEventListener("click", (e) => {
				e.preventDefault(); // a bare <button> in a modal would submit it
				step(direction);
			});
		};
		const by = stepSize(bounds);
		button("−", -1, `Decrease by ${by}`);
		button("+", 1, `Increase by ${by}`);

		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			e.preventDefault();
			step(e.key === "ArrowUp" ? 1 : -1);
		});
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
	/**
	 * Offers to rewrite the text in this field's own notation. Returns the converted
	 * text, or null when there is nothing to offer — the button appears and disappears
	 * with that answer as the text changes.
	 */
	convert?: { label: string; run: (text: string) => string | null };
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
		const initial = this.opts.initial ?? "";
		input.setValue(initial).setPlaceholder(this.opts.placeholder ?? "");
		input.inputEl.rows = 10;
		input.inputEl.setCssStyles({ width: "100%", fontFamily: "var(--font-monospace)" });
		window.setTimeout(() => input.inputEl.focus(), 0);

		// What the draft is compared against: what it opened on, then what was last
		// saved. Without that second half, Save wrote the value and then asked about
		// "unsaved changes" — the guard was comparing against the original text of a
		// modal that had just been committed.
		let baseline = initial;
		const submit = () => {
			const value = input.getValue();
			const result = this.opts.validate?.(value);
			if (result && !result.ok) {
				errorEl.setText(result.message ?? "Invalid value");
				return false;
			}
			this.opts.onSubmit(value);
			baseline = value;
			this.close();
			return true;
		};

		// The parser answers as you type, not only when you ask to save: this is the
		// one editor where a mistake can be twenty lines up, and learning about it on
		// the way out is learning too late. An empty box is not an error — it clears
		// the field.
		const recheck = () => {
			const text = input.getValue();
			const result = text.trim() ? this.opts.validate?.(text) : { ok: true };
			errorEl.setText(result && !result.ok ? (result.message ?? "Invalid value") : "");
			guard.refresh(); // declared below; only ever called from an event
			// The offer follows the text: a JSON field holding YAML can be converted, the
			// same field a keystroke later may not be.
			if (convertBtn && this.opts.convert) {
				const available = this.opts.convert.run(input.getValue()) !== null;
				convertBtn.toggleClass("is-hidden-fc", !available);
			}
		};
		input.inputEl.addEventListener("input", recheck);

		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				submit();
			}
		});
		const footer = new Setting(contentEl).setDesc("Cmd/Ctrl+Enter to save");
		let convertBtn: HTMLButtonElement | null = null;
		if (this.opts.convert) {
			const convert = this.opts.convert;
			footer.addButton((b) => {
				convertBtn = b.buttonEl;
				b.setButtonText(convert.label).onClick(() => {
					const next = convert.run(input.getValue());
					if (next === null) return;
					input.setValue(next);
					recheck();
					input.inputEl.focus();
				});
			});
		}
		footer.addButton((b) => b.setButtonText("Save").setCta().onClick(() => void submit()));
		// Raw text is where the most typing happens, so it is the worst place to lose
		// it: Escape used to discard a blob without a word.
		const guard = attachUnsavedGuard(this.app, this, {
			isDirty: () => input.getValue() !== baseline,
			save: submit,
			subject: "value",
		});
		guard.mountHint(footer.settingEl);
		recheck();
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

		// Seed the controls from the value already stored, so editing one part keeps
		// the others: touching a control re-renders the whole template.
		const stored = this.opts.initial ? matchTemplate(this.opts.template, this.opts.initial) : null;

		// The value as it stands, kept where it can be read while typing. The preview
		// below is the *new* value and is rewritten by the first control you touch —
		// which, for a value that predates the template and so seeds no control, used
		// to be the only place it existed. Nobody should have to remember it.
		if (this.opts.initial) {
			const current = contentEl.createDiv({ cls: "fileclass-current-value" });
			current.createSpan({ text: "Current value: ", cls: "fileclass-current-value-label" });
			current.createSpan({ text: this.opts.initial });
		}

		for (const part of parseTemplate(this.opts.template)) {
			this.values[part.name] = stored?.[part.name] ?? "";
			const row = new Setting(contentEl).setName(part.name);
			if (part.choices) {
				const choices = part.choices;
				row.addDropdown((d) => {
					d.addOption("", "--select--");
					for (const c of choices) d.addOption(c, c);
					if (choices.includes(this.values[part.name])) d.setValue(this.values[part.name]);
					d.onChange((v) => this.onPartChange(part.name, v));
				});
			} else {
				if (part.choicesError) row.setDesc(`Invalid choices JSON (${part.choicesError}); free text.`);
				row.addText((t) =>
					t
						.setPlaceholder(`Value for ${part.name}`)
						.setValue(this.values[part.name])
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
	/** Set when a row was added from the keyboard: the next render focuses Add. */
	private focusAddOnRender = false;

	constructor(app: App, private readonly opts: MultiInputOptions) {
		super(app);
		this.items = [...opts.initial];
	}

	onOpen(): void {
		this.render();
	}

	private editItem(index: number, chain = false): void {
		const current = this.items[index] ?? "";
		const onValue = (value: string) => {
			this.items[index] = value;
			this.focusAddOnRender = chain;
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
			.addButton((b) => {
				b.setButtonText("Add item").onClick(() => {
					this.items.push("");
					this.editItem(this.items.length - 1, true);
				});
				// This render replaced the button that was clicked; focus the new one.
				if (this.focusAddOnRender) {
					this.focusAddOnRender = false;
					returnFocusTo(b.buttonEl);
				}
			})
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
		private readonly groupOf?: (choice: T) => string | null | undefined,
		/** Optional visual leading the row — a media thumbnail, today. */
		private readonly preview?: (choice: T) => HTMLElement | null
	) {
		super(app);
		this.setPlaceholder(placeholder);
		// A SuggestModal's box is `.prompt`, not `.modal`, so the compact-modal rules never
		// reached it: picking one value read a size larger than picking several.
		this.modalEl.addClass("fileclass-prompt");
	}

	onOpen(): void {
		void super.onOpen();
		if (!this.groupOf) return;
		// A sticky "current group" bar overlaid on the top of the scrolling
		// results. Lives in the prompt (a sibling of the results), so it never
		// interferes with the suggestion items or their keyboard navigation.
		const prompt = this.resultContainerEl.parentElement;
		if (!prompt) return;
		prompt.addClass("fileclass-suggest-prompt"); // position: relative for the bar
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
			this.renderRow(el.createDiv(), choice);
			return;
		}
		this.renderRow(el, choice);
	}

	/** The row itself: the preview, then the text. */
	private renderRow(host: HTMLElement, choice: T): void {
		const thumb = this.preview?.(choice);
		if (!thumb) {
			host.setText(this.toText(choice));
			return;
		}
		host.addClass("fileclass-suggestion-row");
		host.append(thumb);
		host.createSpan({ text: this.toText(choice) });
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
	/** Optional visual leading each row — a media thumbnail, today. */
	preview?: (value: string) => HTMLElement | null;
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
	/** Rows, in render order, so the filter can show and hide them. */
	private readonly rows: { value: string; el: HTMLElement }[] = [];
	/** Group headers with their members: a header hides when none match. */
	private readonly headers: { el: HTMLElement; values: string[] }[] = [];
	private emptyEl?: HTMLElement;
	/** The live filter text, kept so a mode change can re-apply it. */
	private query = "";
	/** "Show only what is ticked" — the companion of Unselect all. */
	private selectedOnly = false;
	private onlyEl?: HTMLElement;
	private clearEl?: HTMLButtonElement;

	constructor(app: App, private readonly opts: MultiSelectOptions) {
		super(app);
		this.selected = new Set(opts.selected);
	}

	/**
	 * A filter box above the list. Scrolling to find one value among hundreds is
	 * the actual cost of a long list, whatever the frame rate; typing two letters
	 * is not. It is focused on open, so the modal is usable without the mouse.
	 *
	 * Filtering is **display only**: what gets saved is computed from `selected`
	 * over every option, so hiding a ticked row never drops it. Enter toggles the
	 * first visible match and clears the box, which chains — type, Enter, type,
	 * Enter — and is guarded on a non-empty query so a stray Enter can't tick the
	 * first row of an unfiltered list.
	 */
	private renderFilter(contentEl: HTMLElement): HTMLElement {
		const row = contentEl.createDiv({ cls: "fileclass-filter-row" });
		const input = new TextComponent(row);
		input.setPlaceholder("Filter… (Enter toggles the first match)");
		input.inputEl.addClass("fileclass-filter-input");
		input.onChange((query) => this.applyFilter(query));

		/*
		 * "Only ticked" sits at the end of the filter row, because it filters the
		 * same list — and it is what makes Unselect all usable: narrow to what is
		 * on, see it as a short list, then clear it.
		 */
		const only = row.createSpan({ cls: "fileclass-filter-only clickable-icon" });
		setIcon(only, "list-checks");
		only.addEventListener("click", () => {
			this.selectedOnly = !this.selectedOnly;
			only.toggleClass("is-active", this.selectedOnly);
			this.applyFilter(this.query);
			this.refreshCounts();
		});
		this.onlyEl = only;
		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
			e.preventDefault();
			const query = input.getValue().trim();
			if (!query) return;
			const first = this.rows.find((r) => !r.el.hasClass("fileclass-filter-hidden"));
			if (!first) return;
			first.el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			input.setValue("");
			this.applyFilter("");
		});
		window.setTimeout(() => input.inputEl.focus(), 0);
		return row;
	}

	/**
	 * Applies the text query and the "only ticked" mode together.
	 *
	 * Deliberately NOT called when a row is ticked: in "only ticked" mode that would
	 * make rows vanish from under the pointer as you untick them. The list settles
	 * when you next type or switch the mode.
	 */
	private applyFilter(query: string): void {
		this.query = query;
		const q = query.trim().toLowerCase();
		const visible = (value: string): boolean =>
			(!q || value.toLowerCase().includes(q)) &&
			(!this.selectedOnly || this.selected.has(value));
		let shown = 0;
		for (const { value, el } of this.rows) {
			const hit = visible(value);
			el.toggleClass("fileclass-filter-hidden", !hit);
			if (hit) shown++;
		}
		for (const { el, values } of this.headers) {
			el.toggleClass("fileclass-filter-hidden", !values.some(visible));
		}
		if (shown) this.emptyEl?.hide();
		else this.emptyEl?.show();
	}

	/** Keeps the two selection-aware controls truthful as rows are ticked. */
	private refreshCounts(): void {
		const n = this.selected.size;
		if (this.clearEl) {
			this.clearEl.setText(n ? `Unselect all (${n})` : "Unselect all");
			this.clearEl.disabled = n === 0;
		}
		this.onlyEl?.setAttribute(
			"aria-label",
			this.selectedOnly ? "Showing only ticked values" : `Show only ticked values (${n})`
		);
	}

	/** Unticks everything — all of it, not just what the filter shows. */
	private unselectAll(): void {
		this.selected.clear();
		for (const { el } of this.rows) {
			el.querySelector(".checkbox-container")?.removeClass("is-enabled");
			const input = el.querySelector<HTMLInputElement>("input[type=checkbox]");
			if (input) input.checked = false;
		}
		this.applyFilter(this.query);
		this.refreshCounts();
	}

	onOpen(): void {
		const { contentEl } = this;
		const title = modalTitle(contentEl, this.opts.title);
		// Sticky group headers park just below the sticky title — offset by its height.
		contentEl.style.setProperty("--fc-title-h", `${title.offsetHeight}px`);
		// Preserve allowed order, then any already-selected extras.
		const options = [...new Set([...this.opts.allowed, ...this.opts.selected])];

		const filter = this.renderFilter(contentEl);
		const listEl = contentEl.createDiv();

		const groups = this.opts.groups;
		if (groups && groups.length) {
			const rendered = new Set<string>();
			for (const g of groups) {
				const values = g.values.filter((v) => options.includes(v));
				if (!values.length) continue;
				const header = this.renderGroupHeader(listEl, groupLabel(g.key));
				this.headers.push({ el: header, values });
				for (const v of values) {
					this.renderToggle(listEl, v);
					rendered.add(v);
				}
			}
			const extras = options.filter((v) => !rendered.has(v));
			if (extras.length) {
				const header = this.renderGroupHeader(listEl, "(Other)");
				this.headers.push({ el: header, values: extras });
				for (const v of extras) this.renderToggle(listEl, v);
			}
		} else {
			for (const v of options) this.renderToggle(listEl, v);
		}
		this.emptyEl = listEl.createDiv({
			cls: "setting-item-description fileclass-filter-empty",
			text: "No value matches.",
		});
		this.emptyEl.hide();
		// Measured after layout: the group headers stick below the filter, not under it.
		contentEl.style.setProperty("--fc-filter-h", `${filter.offsetHeight}px`);

		const footer = makeStickyFooter(contentEl);
		new Setting(footer)
			.setClass("fileclass-multi-footer")
			.addButton((b) => {
				// Left of Save: with a long list, unticking one by one is the chore.
				this.clearEl = b.buttonEl;
				b.setButtonText("Unselect all").onClick(() => this.unselectAll());
			})
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.opts.onSubmit(options.filter((v) => this.selected.has(v)));
						this.close();
					})
			);
		this.refreshCounts();
	}

	/**
	 * One row per allowed value. The **whole row** toggles, not just the switch:
	 * with a dozen values the switches are a column of small targets, and the label
	 * is the thing the eye is already on.
	 */
	private renderToggle(container: HTMLElement, value: string): void {
		const apply = (on: boolean): void => {
			if (on) this.selected.add(value);
			else this.selected.delete(value);
			this.refreshCounts();
		};
		let toggle: ToggleComponent | undefined;
		const setting = new Setting(container)
			.setName(value)
			.addToggle((t) => {
				toggle = t;
				t.setValue(this.selected.has(value)).onChange(apply);
			});
		setting.settingEl.addClass("fileclass-toggle-row");
		const thumb = this.opts.preview?.(value);
		if (thumb) {
			setting.nameEl.prepend(thumb);
			setting.nameEl.addClass("fileclass-suggestion-row");
		}
		this.rows.push({ value, el: setting.settingEl });
		setting.settingEl.addEventListener("click", (e) => {
			// The switch handles its own clicks; anywhere else in the row flips it.
			if ((e.target as HTMLElement).closest(".checkbox-container")) return;
			const next = !this.selected.has(value);
			apply(next);
			// Harmless if setValue also fires onChange: apply() is idempotent.
			toggle?.setValue(next);
		});
	}

	private renderGroupHeader(container: HTMLElement, label: string): HTMLElement {
		// Sticky so the current group stays visible while the list scrolls.
		return container.createDiv({
			text: label,
			cls: "fileclass-group-header fileclass-group-sticky",
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
