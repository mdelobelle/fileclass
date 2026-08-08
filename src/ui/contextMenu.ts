/*
 * File / editor context menus (ARCHITECTURE.md §19.3). Adds Fileclass entries
 * to right-click menus (file explorer, tab, editor). All actions reuse existing
 * modals/commands — no new write path. A Component so its event listeners are
 * torn down on plugin unload.
 */
import { Component, Menu, Notice, TAbstractFile, TFile, TFolder } from "obsidian";

import type FileclassPlugin from "../../main";
import { createFileClass } from "../commands/createFileClass";
import { insertMissingFields } from "../commands/insertMissingFields";
import { reorderFrontmatter } from "../io/reorderFrontmatter";
import { reorderPlan } from "../schema/reorder";
import { isClassFolder } from "../schema/classFolder";
import { pickAndUpdateField } from "../fields/fieldActions";
import { pickAndCreateBase } from "../views/baseFileGenerator";
import { fileClassBaseFile, openFileClassBase } from "../views/baseSync";
import { AddFileClassModal } from "./addFileClassModal";
import { openBulkEdit } from "./bulkEditModal";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { NoteFieldsModal } from "./noteFieldsModal";

export class FileclassContextMenu extends Component {
	/** Guards against the editor-menu firing right after a file-menu. */
	private fileMenuOpen = false;

	constructor(private readonly plugin: FileclassPlugin) {
		super();
	}

	onload(): void {
		this.registerEvent(
			this.plugin.app.workspace.on("file-menu", (menu, file) => {
				this.fileMenuOpen = true;
				this.buildForItem(menu, file);
				menu.onHide = () => (this.fileMenuOpen = false);
			})
		);
		this.registerEvent(
			this.plugin.app.workspace.on("editor-menu", (menu) => {
				if (this.fileMenuOpen) return;
				const file = this.plugin.app.workspace.getActiveFile();
				if (file && file.extension === "md") this.build(menu, file);
			})
		);
	}

	/** A note gets note/fileClass actions; the class folder gets "Create a class". */
	private buildForItem(menu: Menu, item: TAbstractFile): void {
		if (item instanceof TFile && item.extension === "md") {
			this.build(menu, item);
			return;
		}
		if (item instanceof TFolder) this.buildClassFolderMenu(menu, item);
	}

	/**
	 * Right-clicking the folder that holds the fileClasses is the place people look
	 * for "make me a new one" — the command palette shouldn't be the only door.
	 */
	private buildClassFolderMenu(menu: Menu, folder: TFolder): void {
		if (!this.plugin.settings.enableContextMenu) return;
		if (!isClassFolder(folder.path, this.plugin.settings.classFilesPath)) return;
		menu.addItem((entry) =>
			entry
				.setTitle("Create a class")
				.setIcon("file-spreadsheet")
				.onClick(() => createFileClass(this.plugin))
		);
	}

	private build(menu: Menu, file: TFile): void {
		if (!this.plugin.settings.enableContextMenu) return;

		// On a fileClass note: only schema actions. Elsewhere: only note actions.
		const fcName = this.plugin.index.fileClassNameOfNote(file.path);
		if (fcName) {
			this.buildFileClassMenu(menu, fcName);
		} else {
			this.buildNoteMenu(menu, file);
		}
	}

	private buildFileClassMenu(menu: Menu, fcName: string): void {
		menu.addItem((item) =>
			item
				.setTitle("Manage this fileClass")
				.setIcon("wrench")
				.onClick(() => openFileClassSchema(this.plugin, fcName))
		);
		const hasBase = !!fileClassBaseFile(this.plugin, fcName);
		menu.addItem((item) =>
			item
				.setTitle(hasBase ? "Modify base for this fileClass" : "Create a base for this fileClass")
				.setIcon("layout-grid")
				.onClick(() => pickAndCreateBase(this.plugin, fcName))
		);
		if (hasBase) {
			menu.addItem((item) =>
				item
					.setTitle("Open base for this fileClass")
					.setIcon("table")
					.onClick(() => openFileClassBase(this.plugin, fcName))
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("Bulk edit a field of this fileClass")
				.setIcon("replace")
				.onClick(() => openBulkEdit(this.plugin, fcName))
		);
	}

	private buildNoteMenu(menu: Menu, file: TFile): void {
		menu.addItem((item) =>
			item
				.setTitle("Manage note fields")
				.setIcon("list")
				.onClick(() => new NoteFieldsModal(this.plugin, file).open())
		);
		menu.addItem((item) =>
			item
				.setTitle("Update a field")
				.setIcon("pencil")
				.onClick(() =>
					pickAndUpdateField(this.plugin, file, this.plugin.index.getFields(file))
				)
		);
		menu.addItem((item) =>
			item
				.setTitle("Insert missing fields")
				.setIcon("plus")
				.onClick(() =>
					void insertMissingFields(this.plugin.app, file, this.plugin.index.getFields(file))
				)
		);
		// Only when there is something to reorder: an entry that answers "already in order"
		// is an entry that wasted a right-click. The check is one pass over the note's keys
		// against the resolved fields, both already in memory (#104).
		if (this.isOutOfOrder(file)) {
			menu.addItem((item) =>
				item
					.setTitle("Reorder properties")
					.setIcon("arrow-down-up")
					.onClick(() => void this.reorder(file))
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("Add fileClass")
				.setIcon("tag")
				.onClick(() => new AddFileClassModal(this.plugin, file).open())
		);
		// One entry per class that applies (#23). Named, not a picker: from here the
		// answer is usually one class, and this is one of the two routes for a class
		// bound by tag, path or Base view — those leave no value to click in the
		// Properties editor. Same wrench as "Manage this fileClass" on a class note.
		for (const name of this.plugin.index.getFileClasses(file)) {
			menu.addItem((item) =>
				item
					.setTitle(`Open ${name} schema`)
					.setIcon("wrench")
					.onClick(() => openFileClassSchema(this.plugin, name))
			);
		}
	}

	/** Does this note's frontmatter differ from the order its class declares? */
	private isOutOfOrder(file: TFile): boolean {
		const fields = this.plugin.index.getFields(file);
		if (!fields.length) return false;
		const keys = Object.keys(
			this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}
		);
		return reorderPlan(fields, keys, this.plugin.settings.unknownKeysPosition) !== null;
	}

	private async reorder(file: TFile): Promise<void> {
		const { moved, unpositionable } = await reorderFrontmatter(
			this.plugin.app,
			file,
			this.plugin.index.getFields(file),
			this.plugin.settings.unknownKeysPosition
		);
		if (!moved) return;
		const caveat = unpositionable.length
			? ` (${unpositionable.join(", ")} stays where YAML puts it)`
			: "";
		new Notice(`Fileclass: reordered ${moved} properties${caveat}.`);
	}
}
