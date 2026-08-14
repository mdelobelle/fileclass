/*
 * fileClass fields manager (ARCHITECTURE.md §20.2). Lists a fileClass's own
 * field definitions and lets the user add / edit / remove / reorder them. Each
 * action is one processFrontMatter write on the fileClass note; the modal
 * re-renders from the live frontmatter as writes land. Per-type option settings
 * (§20.3) come in later slices — here a field is name + type.
 */
import { EventRef, Modal, Notice, Setting, TFile } from "obsidian";

import { modalTitle } from "./modalTitle";
import { attachRowGrid } from "./rowGridKeyboard";

import type FileclassPlugin from "../../main";
import { childPathOf, Field, pathFieldNames } from "../schema/field";
import { parseFileClass } from "../schema/fileClass";
import { fieldOrderKey, isInherited, movedFieldOrder } from "../schema/fieldOrder";
import { dateFormatDefaults } from "../settings/settings";
import { mutateFields, writeOptions } from "../schema/fileClassIo";
import {
	RawFieldEntry,
	addFieldDef,
	collectFieldIds,
	removeFieldDef,
	updateFieldDef,
} from "../schema/fileClassWrite";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { isRequired } from "../fields/validate";
import { FieldDefModal, FieldDefResult } from "./fieldDefModal";
import { migrateRenamedField } from "../commands/renameFieldMigration";
import { writeFieldDependency } from "./fieldSettings";
import { makeStickyFooter } from "./modalFooter";
import { FileClassOptionsModal } from "./fileClassOptionsModal";
import { openBulkEdit } from "./bulkEditModal";
import { pickAndCreateBase } from "../views/baseFileGenerator";
import { fileClassBaseFile, openFileClassBase } from "../views/baseSync";

export class FileClassSchemaModal extends Modal {
	/** Detaches the arrow-key grid of the current render. */
	private detachGrid?: () => void;

	private changeRef?: EventRef;

	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly name: string,
		private readonly file: TFile,
		/** "" for the root; a field id-path when editing an object's children. */
		private readonly parentPath = "",
		/**
		 * Closes whatever opened this modal, for the actions that navigate away
		 * (opening a base leaves a modal stranded over the view it just opened).
		 */
		private readonly closeParent?: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.render();
		this.changeRef = this.app.metadataCache.on("changed", (f) => {
			if (f.path === this.file.path) this.refresh();
		});
	}

	onClose(): void {
		this.detachGrid?.();
		if (this.changeRef) this.app.metadataCache.offref(this.changeRef);
		this.contentEl.empty();
	}

	/**
	 * Everything you can do to the fileClass itself, in the modal that edits it —
	 * the same set as its right-click menu, so the icon, the menu and the
	 * note-fields breadcrumb all land on one screen with nothing missing.
	 */
	private renderClassActions(contentEl: HTMLElement): void {
		const hasBase = !!fileClassBaseFile(this.plugin, this.name);
		const leave = () => {
			this.close();
			this.closeParent?.();
		};
		new Setting(contentEl)
			.setName("This fileClass")
			.addButton((b) =>
				b
					.setButtonText("Options…")
					.setTooltip("Icon, inheritance, base sync, bindings")
					.onClick(() => new FileClassOptionsModal(this.plugin, this.name, this.file).open())
			)
			.addExtraButton((b) =>
				b
					.setIcon("layout-grid")
					.setTooltip(hasBase ? "Modify its base" : "Create a base")
					.onClick(() => {
						leave();
						pickAndCreateBase(this.plugin, this.name);
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("table")
					.setTooltip(hasBase ? "Open its base" : "No base yet")
					.setDisabled(!hasBase)
					.onClick(() => {
						leave();
						void openFileClassBase(this.plugin, this.name);
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("replace")
					.setTooltip("Bulk edit one of its fields")
					.onClick(() => {
						this.close();
						openBulkEdit(this.plugin, this.name);
					})
			);
	}

	/** Fields at the current level (root or an object's children), read fresh. */
	private frontmatter(): Record<string, unknown> | undefined {
		return this.app.metadataCache.getFileCache(this.file)?.frontmatter;
	}

	/**
	 * The fields of this level — **resolved**, so what the class inherits is listed too.
	 *
	 * A class's order runs over its whole set, inherited fields included, so the editor has to show
	 * that set: ordering `Media`'s `title` against `Book`'s `author` is impossible on a screen that
	 * only lists one of them. Which class each field comes from is said on its row.
	 */
	private levelFields(): Field[] {
		return this.plugin.index
			.getResolvedFields(this.name)
			.filter((f) => f.path === this.parentPath);
	}

	/** The whole resolved set, for the keys a move has to write. */
	private resolvedFields(): Field[] {
		return this.plugin.index.getResolvedFields(this.name);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		// "Book › publisher › headquarter › children" rather than "Book › children":
		// two levels of nesting look identical without the trail, and the children of a
		// group are exactly where you need to know which group you are in.
		const trail = pathFieldNames(parseFileClass(this.name, this.frontmatter()).fields, this.parentPath);
		const heading = this.parentPath
			? [this.name, ...trail, "children"].join(" › ")
			: `Schema — ${this.name}`;
		modalTitle(contentEl, heading);

		if (!this.parentPath) this.renderClassActions(contentEl);

		const fields = this.levelFields();
		if (!fields.length) contentEl.createEl("p", { text: "No fields yet." });

		// The field rows live in their own container: the arrow-key grid must not
		// reach the class-level actions above them.
		const listEl = contentEl.createDiv({ cls: "fileclass-field-list" });

		const resolved = this.resolvedFields();
		fields.forEach((field, i) => {
			const inherited = isInherited(field, this.name);
			const key = fieldOrderKey(resolved, field);
			const setting = new Setting(listEl)
				.setName(field.name)
				// A field's type, and whether it may be left empty. Until now `required`
				// lived only inside the field's own modal, so a class of a dozen fields
				// hid which ones were mandatory behind a dozen clicks.
				.setDesc(isRequired(field) ? `${field.type} · required` : field.type)
				.addExtraButton((b) =>
					b
						.setIcon("chevron-up")
						.setTooltip("Move up")
						.setDisabled(i === 0)
						.onClick(() => this.move(key, -1))
				)
				.addExtraButton((b) =>
					b
						.setIcon("chevron-down")
						.setTooltip("Move down")
						.setDisabled(i === fields.length - 1)
						.onClick(() => this.move(key, 1))
				);

			// Where an inherited field comes from, and the way to it: editing it here would edit
			// the ancestor for every class that extends it, so this row moves it and nothing else.
			if (inherited) {
				setting.nameEl.createSpan({ cls: "fileclass-field-from", text: `from ${field.fileClassName}` });
				setting.addButton((b) =>
					b
						.setButtonText(`Open ${field.fileClassName}`)
						.setTooltip(`Edit this field where it is declared`)
						.onClick(() => {
							this.close();
							openFileClassSchema(this.plugin, field.fileClassName);
						})
				);
				return;
			}

			if (field.type === "Object" || field.type === "ObjectList") {
				setting.addButton((b) =>
					b.setButtonText("Children").onClick(() =>
						new FileClassSchemaModal(
							this.plugin,
							this.name,
							this.file,
							childPathOf(field)
						).open()
					)
				);
			}

			setting
				.addButton((b) => b.setButtonText("Edit").onClick(() => this.editField(field)))
				.addExtraButton((b) =>
					b.setIcon("trash").setTooltip("Remove").onClick(() => this.remove(field.id))
				);
		});

		this.detachGrid?.();
		this.detachGrid = attachRowGrid(listEl, {
			rowSelector: ":scope > .setting-item",
			actionSelector: "button, .clickable-icon",
			preferred: "Edit",
		});

		new Setting(makeStickyFooter(contentEl)).addButton((b) =>
			b.setButtonText("Add field").setCta().onClick(() => this.addField())
		);
	}

	/**
	 * Public because the Properties panel offers *Add a field* on a class note: it opens this
	 * modal and this dialog on top of it, so the field lands in a list you are already looking
	 * at rather than nowhere visible.
	 */
	addField(): void {
		new FieldDefModal(this.app, {
			title: "Add field",
			dateDefaults: dateFormatDefaults(this.plugin.settings),
			classFields: this.plugin.index.getResolvedFields(this.name),
			onSubmit: (r) => {
				void mutateFields(this.app, this.file, (fields) =>
					addFieldDef(
						fields,
						{ name: r.name, type: r.type, options: r.options, path: this.parentPath },
						// Every id of the whole chain, not just this class's. Parentage of a
						// nested field is a `path` — the parent's id — matched over the
						// **resolved** field set, so two classes of one chain drawing the same
						// six characters would hand one group the other's children. Measured
						// before fixing: `childFieldsOf` returned Media's `producer` among
						// Book's `storage` children.
						this.chainIds(fields)
					)
				).then(() => this.writeDependency(r));
			},
		}).open();
	}

	/**
	 * The ids a new field must avoid: this class's own (as written on disk) plus every id
	 * reachable through `extends`. One in 56 billion per pair is not a reason to leave a
	 * corruption reachable when the fix is one union.
	 */
	private chainIds(fields: RawFieldEntry[]): Set<string> {
		const ids = collectFieldIds(fields);
		for (const f of this.plugin.index.getResolvedFields(this.name)) ids.add(f.id);
		return ids;
	}

	/** What saving a definition implies beyond the write — shared with the other door. */
	private writeDependency(r: FieldDefResult): void {
		writeFieldDependency(this.plugin, this.name, r);
	}

	private editField(field: Field): void {
		new FieldDefModal(this.app, {
			title: `Edit ${field.name}`,
			dateDefaults: dateFormatDefaults(this.plugin.settings),
			classFields: this.plugin.index.getResolvedFields(this.name),
			initial: { name: field.name, type: field.type, options: field.options },
			onEditChildren: () =>
				new FileClassSchemaModal(this.plugin, this.name, this.file, childPathOf(field)).open(),
			onSubmit: (r) => {
				void mutateFields(this.app, this.file, (fields) =>
					updateFieldDef(fields, field.id, {
						name: r.name,
						type: r.type,
						options: r.options,
					})
				).then(async () => {
					this.writeDependency(r);
					// The other door onto the same editor, and the same rule: renaming a field
					// offers to migrate the notes that carry the old key (#108).
					await migrateRenamedField(this.plugin, { ...field, name: r.name }, field.name);
				});
			},
		}).open();
	}

	private remove(id: string): void {
		void mutateFields(this.app, this.file, (fields) => removeFieldDef(fields, id));
	}

	/**
	 * Moves a field within its level by writing the class's own `fieldsOrder`.
	 *
	 * Not by swapping entries in `fields[]`, which is what this used to do: that array holds only
	 * the class's own fields, so it cannot express "Media's title, then my author, then Media's
	 * year" — and once an order exists, two writers of it would drift apart. `fieldsOrder` is the
	 * single one, and it names every field of the resolved set on every move.
	 */
	private move(key: string, dir: -1 | 1): void {
		const order = movedFieldOrder(this.resolvedFields(), key, dir);
		if (!order) return;
		void writeOptions(this.app, this.file, { fieldsOrder: order }).then(() => this.refresh());
	}

	/**
	 * Rebuilds the index, then the list.
	 *
	 * This screen reads the **resolved** field set — the class's fields and its ancestors', in the
	 * order the class declares — and that set is built by the index, whose rebuild is debounced by
	 * 400 ms. Rendering on the metadata event alone therefore drew the list as it was *before* the
	 * write that triggered it: measured, moving the second row up wrote the right order and left the
	 * list unchanged, so the next click acted on a row that was no longer where it appeared. One
	 * class note's rebuild is idempotent and cheap, which is why it can be asked for here.
	 */
	private refresh(): void {
		this.plugin.index.rebuild();
		this.render();
	}
}

/**
 * Opens the schema editor for `name`, or a fileClass picker when omitted.
 * `closeParent` is dismissed by the actions that navigate away from the modal.
 */
/**
 * The schema editor with its *Add field* dialog already open — what the Properties panel's
 * *Add a field* does on a class note. Two modals, and the stack is LIFO (#118): answer the
 * dialog and the schema behind it is where you land.
 */
export function openAddFieldTo(plugin: FileclassPlugin, name: string): void {
	const file = plugin.index.getFileClassFile(name);
	if (!file) {
		new Notice(`Fileclass: note for "${name}" not found.`);
		return;
	}
	const modal = new FileClassSchemaModal(plugin, name, file);
	modal.open();
	modal.addField();
}

export function openFileClassSchema(
	plugin: FileclassPlugin,
	name?: string,
	closeParent?: () => void
): void {
	const open = (n: string) => {
		const file = plugin.index.getFileClassFile(n);
		if (!file) {
			new Notice(`Fileclass: note for "${n}" not found.`);
			return;
		}
		new FileClassSchemaModal(plugin, n, file, "", closeParent).open();
	};
	if (name) return open(name);

	const names = plugin.index.fileClassNames;
	if (!names.length) {
		new Notice("Fileclass: no fileClasses defined.");
		return;
	}
	new ChoiceSuggestModal<string>(
		plugin.app,
		[...names].sort(),
		(n) => n,
		open,
		"Select a fileClass to edit"
	).open();
}
