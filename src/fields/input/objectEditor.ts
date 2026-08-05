/*
 * Object / ObjectList draft editors (ARCHITECTURE.md §8, D5). Recursive modals
 * driven by the child schema. Editing happens on an in-memory draft (a clone of
 * the user's value): Cancel writes nothing; Save validates the whole draft and
 * hands it back via `onSave` — the single processFrontMatter write is performed
 * by the caller. Child values are edited through the injected `promptChild`
 * (which dispatches to the right input, including nested objects) so this module
 * has no dependency cycle with the field dispatcher.
 */
import { App, Modal, Notice, Setting } from "obsidian";

import { modalTitle } from "../../ui/modalTitle";

import { Field } from "../../schema/field";
import { describeField, DisplayDeps, renderObjectItem } from "../objectDisplay";
import { cloneDraft, validateObjectDraft } from "../objectDraft";
import { makeStickyFooter } from "../../ui/modalFooter";
import { attachRowGrid } from "../../ui/rowGridKeyboard";
import { attachUnsavedGuard, snapshot, UnsavedGuard } from "../../ui/unsavedGuard";

/** Opens the input for a child field, calling back with its new value. */
export type ChildPrompt = (
	field: Field,
	current: unknown,
	onValue: (value: unknown) => void
) => void;

interface ObjectEditorOptions {
	title: string;
	/**
	 * The text of a value that isn't a group at all — what the field held before it
	 * became one. Shown, and protected: saving an untouched empty draft over it used
	 * to replace it with `{}` without a word.
	 */
	stray?: string | null;
	/** The Object/ObjectList field being edited (for its display template). */
	field: Field;
	childFields: Field[];
	promptChild: ChildPrompt;
	deps: DisplayDeps;
}

/** Edits a single object's fields. */
export class ObjectFieldsEditorModal extends Modal {
	private readonly draft: Record<string, unknown>;
	/** Detaches the arrow-key grid of the current render. */
	private detachGrid?: () => void;
	/** Snapshot of the draft as opened, or as last saved. */
	private opened = "";
	private guard!: UnsavedGuard;

	constructor(
		app: App,
		private readonly opts: ObjectEditorOptions & {
			initial: Record<string, unknown>;
			onSave: (object: Record<string, unknown>) => void;
		}
	) {
		super(app);
		this.draft = cloneDraft(opts.initial);
	}

	onOpen(): void {
		this.opened = snapshot(this.draft);
		// Attached once: render() rebuilds the content, and wrapping close on every
		// render would nest one wrapper per keystroke.
		this.guard = attachUnsavedGuard(this.app, this, {
			isDirty: () => snapshot(this.draft) !== this.opened,
			save: () => this.commit(),
			subject: "group",
		});
		this.render();
	}

	/** Commits the draft. False when it can't be saved, so the caller stays open. */
	private commit(): boolean {
		if (keptStray(this.opts.stray, Object.keys(this.draft).length)) return false;
		const error = validateObjectDraft(this.opts.childFields, this.draft);
		if (error) {
			new Notice(`Fileclass: ${error}`);
			return false;
		}
		this.opts.onSave(this.draft);
		this.opened = snapshot(this.draft);
		return true;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		modalTitle(contentEl, this.opts.title);

		if (!this.opts.childFields.length) {
			contentEl.createEl("p", { text: "This object has no fields defined." });
		}
		showStray(contentEl, this.opts.stray);

		// The value rows live in their own container so the arrow keys can walk them
		// without reaching the footer.
		const listEl = contentEl.createDiv({ cls: "fileclass-field-list" });

		for (const child of this.opts.childFields) {
			const value = this.draft[child.name];
			new Setting(listEl)
				.setName(child.name)
				.setDesc(child.type)
				// Classed, so the reading of a child's value is the size of every other value
				// we show rather than the modal's body text.
				.then((s) =>
					s.controlEl.createSpan({
						cls: "fileclass-object-value",
						text: describeField(child, value, this.opts.deps),
					})
				)
				.addButton((b) =>
					b.setButtonText("Edit").onClick(() =>
						this.opts.promptChild(child, value, (v) => {
							if (v === undefined) delete this.draft[child.name];
							else this.draft[child.name] = v;
							this.render();
						})
					)
				)
				.addExtraButton((b) =>
					b
						.setIcon("x")
						.setTooltip("Clear")
						.onClick(() => {
							delete this.draft[child.name];
							this.render();
						})
				);
		}

		this.detachGrid?.();
		this.detachGrid = attachRowGrid(listEl, {
			rowSelector: ":scope > .setting-item",
			actionSelector: "button, .clickable-icon",
			preferred: "Edit",
		});

		const footer = makeStickyFooter(contentEl);
		const footerRow = new Setting(footer);
		this.guard.mountHint(footerRow.settingEl);
		footerRow.addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					if (this.commit()) this.close();
				})
		);
	}

	onClose(): void {
		this.detachGrid?.();
		this.contentEl.empty();
	}
}

/** Manages an array of objects: add, edit, remove, reorder. */
export class ObjectListEditorModal extends Modal {
	private readonly draft: Record<string, unknown>[];
	/** Detaches the arrow-key grid of the current render. */
	private detachGrid?: () => void;
	/** Snapshot of the draft as opened, or as last saved. */
	private opened = "";
	private guard!: UnsavedGuard;

	constructor(
		app: App,
		private readonly opts: ObjectEditorOptions & {
			initial: Record<string, unknown>[];
			onSave: (list: Record<string, unknown>[]) => void;
		}
	) {
		super(app);
		this.draft = cloneDraft(opts.initial);
	}

	onOpen(): void {
		this.opened = snapshot(this.draft);
		this.guard = attachUnsavedGuard(this.app, this, {
			isDirty: () => snapshot(this.draft) !== this.opened,
			save: () => this.commit(),
			subject: "list",
		});
		this.render();
	}

	/** Commits the draft. False when it can't be saved, so the caller stays open. */
	private commit(): boolean {
		if (keptStray(this.opts.stray, this.draft.length)) return false;
		this.opts.onSave(this.draft);
		this.opened = snapshot(this.draft);
		return true;
	}

	private editItem(index: number): void {
		this.openItem(index, this.draft[index] ?? {}, (object) => {
			this.draft[index] = object;
		});
	}

	/**
	 * A new item exists only once its editor is saved. Pushing it first and editing
	 * in place looked equivalent and wasn't: cancelling the editor left an empty item
	 * in the draft that no row showed — the list still read "2 items" — and the next
	 * Save wrote `{}` into the frontmatter.
	 */
	private addItem(): void {
		this.openItem(this.draft.length, {}, (object) => {
			this.draft.push(object);
		});
	}

	private openItem(
		index: number,
		initial: Record<string, unknown>,
		place: (object: Record<string, unknown>) => void
	): void {
		new ObjectFieldsEditorModal(this.app, {
			title: `${this.opts.title} — item ${index + 1}`,
			field: this.opts.field,
			childFields: this.opts.childFields,
			promptChild: this.opts.promptChild,
			deps: this.opts.deps,
			initial,
			onSave: (object) => {
				place(object);
				this.render();
			},
		}).open();
	}

	private move(index: number, delta: number): void {
		const target = index + delta;
		if (target < 0 || target >= this.draft.length) return;
		[this.draft[index], this.draft[target]] = [this.draft[target], this.draft[index]];
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		modalTitle(contentEl, this.opts.title);
		showStray(contentEl, this.opts.stray);

		const listEl = contentEl.createDiv({ cls: "fileclass-field-list" });

		this.draft.forEach((item, index) => {
			new Setting(listEl)
				.setName(`Item ${index + 1}`)
				.setDesc(renderObjectItem(this.opts.field, item, this.opts.deps) || "(empty)")
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
							this.draft.splice(index, 1);
							this.render();
						})
				);
		});

		this.detachGrid?.();
		this.detachGrid = attachRowGrid(listEl, {
			rowSelector: ":scope > .setting-item",
			actionSelector: "button, .clickable-icon",
			preferred: "Edit",
		});

		const footer = makeStickyFooter(contentEl);
		const footerRow = new Setting(footer);
		this.guard.mountHint(footerRow.settingEl);
		footerRow
			.addButton((b) =>
				b.setButtonText("Add item").onClick(() => this.addItem())
			)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						if (this.commit()) this.close();
					})
			);
	}

	onClose(): void {
		this.detachGrid?.();
		this.contentEl.empty();
	}
}

/** Shows the value the field holds when that value isn't a group. */
function showStray(contentEl: HTMLElement, stray?: string | null): void {
	if (!stray) return;
	const line = contentEl.createDiv({ cls: "fileclass-current-value" });
	line.createSpan({ text: "Current value, not a group yet: ", cls: "fileclass-current-value-label" });
	line.createSpan({ text: stray });
}

/**
 * True when the save should be refused: nothing was entered and the field holds a
 * value that isn't a group. Writing then would destroy it silently; Clear on the
 * field is how you remove a value on purpose.
 */
function keptStray(stray: string | null | undefined, entries: number): boolean {
	if (!stray || entries > 0) return false;
	new Notice("Fileclass: nothing entered — the current value is kept. Use Clear to remove it.");
	return true;
}
