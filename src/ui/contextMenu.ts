/*
 * File / editor context menus (ARCHITECTURE.md §19.3). Adds a single "Fileclass"
 * submenu (like the Blueprint plugin) to right-click menus — on notes (field
 * actions), on `.fileclass` definitions (schema actions), and on folders (create
 * a fileClass here). All actions reuse existing modals/commands — no new write
 * path. A Component so its event listeners are torn down on plugin unload.
 *
 * `MenuItem.setSubmenu()` is an Obsidian private API (not in the public typings),
 * reached via a minimal `unknown` cast per the repo's private-internals rule.
 */
import { Component, Menu, TFile, TFolder } from "obsidian";

import type FileclassPlugin from "../../main";
import { createFileClassInFolder } from "../commands/createFileClass";
import { insertMissingFields } from "../commands/insertMissingFields";
import { pickAndUpdateField } from "../fields/fieldActions";
import { pickAndCreateBase } from "../views/baseFileGenerator";
import { fileClassBaseFile, openFileClassBase } from "../views/baseSync";
import { AddFileClassModal } from "./addFileClassModal";
import { openBulkEdit } from "./bulkEditModal";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { NoteFieldsModal } from "./noteFieldsModal";

/** Minimal shape for the private `MenuItem.setSubmenu()` API. */
interface SubmenuItem {
	setSubmenu(): Menu;
}

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
				menu.onHide = () => (this.fileMenuOpen = false);
				if (!this.plugin.settings.enableContextMenu) return;
				if (file instanceof TFolder) this.buildFolderMenu(menu, file);
				else if (file instanceof TFile) this.build(menu, file);
			})
		);
		this.registerEvent(
			this.plugin.app.workspace.on("editor-menu", (menu) => {
				if (this.fileMenuOpen || !this.plugin.settings.enableContextMenu) return;
				const file = this.plugin.app.workspace.getActiveFile();
				if (file) this.build(menu, file);
			})
		);
	}

	/** Adds the "Fileclass" parent item and returns its submenu. */
	private submenu(menu: Menu): Menu {
		let sub: Menu = menu;
		menu.addItem((item) => {
			item.setTitle("Fileclass").setIcon("shapes");
			sub = (item as unknown as SubmenuItem).setSubmenu();
		});
		return sub;
	}

	private build(menu: Menu, file: TFile): void {
		// A `.fileclass` definition (indexed) → schema actions; a note → field actions.
		const fcName = this.plugin.index.fileClassNameOfNote(file.path);
		if (fcName) {
			this.buildFileClassMenu(this.submenu(menu), fcName);
		} else if (file.extension === "md") {
			this.buildNoteMenu(this.submenu(menu), file);
		}
	}

	private buildFolderMenu(menu: Menu, folder: TFolder): void {
		this.submenu(menu).addItem((item) =>
			item
				.setTitle("New fileClass here")
				.setIcon("plus")
				.onClick(() => createFileClassInFolder(this.plugin, folder.path))
		);
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
				.onClick(() => pickAndUpdateField(this.plugin, file, this.plugin.index.getFields(file)))
		);
		menu.addItem((item) =>
			item
				.setTitle("Insert missing fields")
				.setIcon("plus")
				.onClick(() =>
					void insertMissingFields(this.plugin.app, file, this.plugin.index.getFields(file))
				)
		);
		menu.addItem((item) =>
			item
				.setTitle("Add fileClass")
				.setIcon("tag")
				.onClick(() => new AddFileClassModal(this.plugin, file).open())
		);
	}
}
