/*
 * Settings tab (ARCHITECTURE.md §4). Minimal for P1: the folder holding
 * fileClass notes, the binding alias, and the optional global fileClass.
 * Sentence-case headings and bold literal UI labels per Obsidian guidelines.
 */
import { App, PluginSettingTab, Setting } from "obsidian";

import type FileclassPlugin from "../../main";
import { FolderSuggest } from "../ui/folderSuggest";
import { normalizeFolderPath } from "./settings";

export class FileclassSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: FileclassPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Class files folder")
			.setDesc("Folder containing your fileClass notes. Notes here define schemas.")
			.addText((text) => {
				text
					.setPlaceholder("e.g. Settings/fileClasses")
					.setValue(this.plugin.settings.classFilesPath)
					.onChange(async (value) => {
						this.plugin.settings.classFilesPath = normalizeFolderPath(value);
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName("fileClass alias")
			.setDesc("Frontmatter key that binds a note to its fileClass(es).")
			.addText((text) =>
				text
					.setPlaceholder("fileClass")
					.setValue(this.plugin.settings.fileClassAlias)
					.onChange(async (value) => {
						this.plugin.settings.fileClassAlias = value.trim() || "fileClass";
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
					})
			);

		new Setting(containerEl)
			.setName("Global fileClass")
			.setDesc("Applied to every note that has no other binding. Leave empty to disable.")
			.addText((text) =>
				text
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.globalFileClass)
					.onChange(async (value) => {
						this.plugin.settings.globalFileClass = value.trim();
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
					})
			);

		new Setting(containerEl)
			.setName("Context menu entries")
			.setDesc("Add Fileclass actions to the file and editor right-click menus.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableContextMenu).onChange(async (value) => {
					this.plugin.settings.enableContextMenu = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
