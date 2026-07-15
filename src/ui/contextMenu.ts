/*
 * File / editor context menus (ARCHITECTURE.md §19.3). Adds Fileclass entries
 * to right-click menus (file explorer, tab, editor). All actions reuse existing
 * modals/commands — no new write path. A Component so its event listeners are
 * torn down on plugin unload.
 */
import { Component, Menu, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";
import { pickAndUpdateField } from "../fields/fieldActions";
import { AddFileClassModal } from "./addFileClassModal";
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
				if (file instanceof TFile && file.extension === "md") this.build(menu, file);
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

	private build(menu: Menu, file: TFile): void {
		if (!this.plugin.settings.enableContextMenu) return;
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
		menu.addItem((item) =>
			item
				.setTitle("Add fileClass")
				.setIcon("tag")
				.onClick(() => new AddFileClassModal(this.plugin, file).open())
		);

		const fcName = this.plugin.index.fileClassNameOfNote(file.path);
		menu.addItem((item) =>
			item
				.setTitle(fcName ? "Manage this fileClass's fields" : "Edit a fileClass schema")
				.setIcon("wrench")
				.onClick(() => openFileClassSchema(this.plugin, fcName))
		);
	}
}
