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

import { Field } from "../../schema/field";
import { describeField, DisplayDeps, renderObjectItem } from "../objectDisplay";
import { cloneDraft, validateObjectDraft } from "../objectDraft";
import { makeStickyFooter } from "../../ui/modalFooter";

/** Opens the input for a child field, calling back with its new value. */
export type ChildPrompt = (
	field: Field,
	current: unknown,
	onValue: (value: unknown) => void
) => void;

interface ObjectEditorOptions {
	title: string;
	/** The Object/ObjectList field being edited (for its display template). */
	field: Field;
	childFields: Field[];
	promptChild: ChildPrompt;
	deps: DisplayDeps;
}

/** Edits a single object's fields. */
export class ObjectFieldsEditorModal extends Modal {
	private readonly draft: Record<string, unknown>;

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
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: this.opts.title });

		if (!this.opts.childFields.length) {
			contentEl.createEl("p", { text: "This object has no fields defined." });
		}

		for (const child of this.opts.childFields) {
			const value = this.draft[child.name];
			new Setting(contentEl)
				.setName(child.name)
				.setDesc(child.type)
				.then((s) => s.controlEl.createSpan({ text: describeField(child, value, this.opts.deps) }))
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

		new Setting(makeStickyFooter(contentEl)).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					const error = validateObjectDraft(this.opts.childFields, this.draft);
					if (error) {
						new Notice(`Fileclass: ${error}`);
						return;
					}
					this.opts.onSave(this.draft);
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Manages an array of objects: add, edit, remove, reorder. */
export class ObjectListEditorModal extends Modal {
	private readonly draft: Record<string, unknown>[];

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
		this.render();
	}

	private editItem(index: number): void {
		new ObjectFieldsEditorModal(this.app, {
			title: `${this.opts.title} — item ${index + 1}`,
			field: this.opts.field,
			childFields: this.opts.childFields,
			promptChild: this.opts.promptChild,
			deps: this.opts.deps,
			initial: this.draft[index] ?? {},
			onSave: (object) => {
				this.draft[index] = object;
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
		contentEl.createEl("h3", { text: this.opts.title });

		this.draft.forEach((item, index) => {
			new Setting(contentEl)
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

		new Setting(makeStickyFooter(contentEl))
			.addButton((b) =>
				b.setButtonText("Add item").onClick(() => {
					this.draft.push({});
					this.editItem(this.draft.length - 1);
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.opts.onSave(this.draft);
						this.close();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
