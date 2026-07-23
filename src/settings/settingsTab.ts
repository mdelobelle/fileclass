/*
 * Settings tab (ARCHITECTURE.md §4). Minimal for P1: the folder holding
 * fileClass notes, the binding alias, and the optional global fileClass.
 * Sentence-case headings and bold literal UI labels per Obsidian guidelines.
 */
import { App, PluginSettingTab, Setting, setIcon } from "obsidian";

import type FileclassPlugin from "../../main";
import { addCustomColor, removeCustomColor } from "../fields/customPalette";
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
			.setName("Bases folder")
			.setDesc("Where generated <fileClass>.base files are written.")
			.addText((text) => {
				text
					.setPlaceholder("(vault root)")
					.setValue(this.plugin.settings.basesFolder)
					.onChange(async (value) => {
						this.plugin.settings.basesFolder = normalizeFolderPath(value);
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName("Default date display format")
			.setDesc(
				"moment.js format for showing Date values (e.g. LL, DD/MM/YYYY). Blank shows the stored value. Per-field object templates can override it with {{field|FORMAT}}."
			)
			.addText((text) =>
				text
					.setPlaceholder("(stored value)")
					.setValue(this.plugin.settings.defaultDateDisplayFormat)
					.onChange(async (value) => {
						this.plugin.settings.defaultDateDisplayFormat = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Validation columns")
			.setDesc(
				"Add valid ✓/✗ and errors columns to the editable fileclass-table view, showing which notes violate their schema."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableValidationColumns).onChange(async (value) => {
					this.plugin.settings.enableValidationColumns = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Canvas fields engine")
			.setDesc(
				"Auto-fill Canvas/CanvasGroup/CanvasGroupLink fields from .canvas files. This writes to frontmatter automatically when a canvas changes."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableCanvasEngine).onChange(async (value) => {
					this.plugin.settings.enableCanvasEngine = value;
					await this.plugin.saveSettings();
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

		new Setting(containerEl)
			.setName("Property editor buttons")
			.setDesc("Show an edit button on properties that match a fileClass field, for typed input.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enablePropertyEditButtons).onChange(async (value) => {
					this.plugin.settings.enablePropertyEditButtons = value;
					await this.plugin.saveSettings();
					this.plugin.propertyButtons.refreshNow();
				})
			);

		new Setting(containerEl).setName("Indicators").setHeading();
		containerEl.createEl("p", {
			text: "A clickable icon next to a note's name opens its fields.",
			cls: "setting-item-description",
		});

		type IndicatorKey =
			| "enableTabHeaderIndicator"
			| "enableFileExplorerIndicator"
			| "enableBookmarksIndicator"
			| "enableInlineLinkIndicator"
			| "enableBacklinkIndicator"
			| "enableBasesIndicator";

		const indicatorToggle = (name: string, key: IndicatorKey, desc?: string) => {
			const setting = new Setting(containerEl).setName(name);
			if (desc) setting.setDesc(desc);
			setting.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value;
					await this.plugin.saveSettings();
					this.plugin.indicator.refreshNow();
					this.plugin.linkIndicator.refreshNow();
				})
			);
		};

		indicatorToggle("Tab header", "enableTabHeaderIndicator");
		indicatorToggle("File explorer", "enableFileExplorerIndicator");
		indicatorToggle("Bookmarks", "enableBookmarksIndicator");
		indicatorToggle(
			"Internal links",
			"enableInlineLinkIndicator",
			"After every internal link, in reading view and Live Preview."
		);
		indicatorToggle("Backlinks pane", "enableBacklinkIndicator");
		indicatorToggle("Bases first column", "enableBasesIndicator");

		this.renderCustomColors(containerEl);
	}

	/** A reusable palette of user colors, offered by every Color field picker. */
	private renderCustomColors(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Custom colors").setHeading();
		containerEl.createEl("p", {
			text: "Extra colors offered by the color pickers, after the standard palette.",
			cls: "setting-item-description",
		});

		const paletteEl = containerEl.createDiv({ cls: "fileclass-settings-palette" });

		const render = (): void => {
			paletteEl.empty();
			for (const color of this.plugin.settings.customColors) {
				const chip = paletteEl.createDiv({
					cls: "fileclass-color-circle fileclass-swatch-static",
					attr: { title: color },
				});
				chip.setCssStyles({ backgroundColor: color });
				const remove = chip.createSpan({ cls: "fileclass-swatch-remove", attr: { "aria-label": "Remove" } });
				setIcon(remove, "x");
				remove.onclick = () => void removeCustomColor(color).then(render);
			}
			// A <label> wrapping a hidden native color input: clicking it opens the
			// native dialog reliably (label activation), unlike input.click().
			const add = paletteEl.createEl("label", {
				cls: "fileclass-color-circle is-add",
				attr: { "aria-label": "Add color", title: "Add color" },
			});
			setIcon(add, "plus");
			const input = add.createEl("input", { cls: "fileclass-color-hidden", attr: { type: "color" } });
			input.value = "#000000";
			input.addEventListener("change", () => void addCustomColor(input.value).then(render));
		};
		render();
	}
}
