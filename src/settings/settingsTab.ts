/*
 * Settings tab (ARCHITECTURE.md §4). Minimal for P1: the folder holding
 * fileClass notes, the binding alias, and the optional global fileClass.
 * Sentence-case headings and bold literal UI labels per Obsidian guidelines.
 */
import { App, PluginSettingTab, Setting, setIcon } from "obsidian";

import { attachFormatPreview } from "../ui/dateFormatPreview";

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

		// Write formats, not display: they decide what a date field puts in the
		// file when the field itself declares no format.
		const dateFormatSetting = (
			name: string,
			desc: string,
			nativeFormat: string,
			get: () => string,
			set: (value: string) => void
		) => {
			const setting = new Setting(containerEl).setName(name).setDesc(desc);
			// Live output, so a format is judged on what it writes, not on its tokens.
			const refresh = attachFormatPreview(setting, () => nativeFormat);
			setting.addText((text) =>
				text
					.setPlaceholder(nativeFormat)
					.setValue(get())
					.onChange(async (value) => {
						set(value.trim());
						refresh(value);
						await this.plugin.saveSettings();
					})
			);
			refresh(get());
		};

		dateFormatSetting(
			"Default date format",
			"moment.js format a Date field is written in when it has no format of its own (e.g. DD/MM/YYYY). Blank stores the ISO form YYYY-MM-DD.",
			"YYYY-MM-DD",
			() => this.plugin.settings.defaultDateFormat,
			(v) => (this.plugin.settings.defaultDateFormat = v)
		);
		dateFormatSetting(
			"Default datetime format",
			"Same, for DateTime fields. Blank stores YYYY-MM-DD[T]HH:mm.",
			"YYYY-MM-DD[T]HH:mm",
			() => this.plugin.settings.defaultDateTimeFormat,
			(v) => (this.plugin.settings.defaultDateTimeFormat = v)
		);
		dateFormatSetting(
			"Default time format",
			"Same, for Time fields. Blank stores HH:mm.",
			"HH:mm",
			() => this.plugin.settings.defaultTimeFormat,
			(v) => (this.plugin.settings.defaultTimeFormat = v)
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
			.setName("Insert fields when adding a class")
			.setDesc(
				"Binding a fileClass to a note adds its missing fields to the frontmatter straight away, instead of leaving you to run Insert missing fields."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.insertFieldsOnBind).onChange(async (value) => {
					this.plugin.settings.insertFieldsOnBind = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Property editor buttons")
			.setDesc(
				"Show Fileclass buttons inside property rows: typed input on a field, and a shortcut to a class's schema on the fileClass row."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enablePropertyEditButtons).onChange(async (value) => {
					this.plugin.settings.enablePropertyEditButtons = value;
					await this.plugin.saveSettings();
					this.plugin.propertyButtons.refreshNow();
				})
			);

		new Setting(containerEl)
			.setName("Property section actions")
			.setDesc(
				'Show "Add a class" next to "Add property", and "Insert missing fields" when the note is missing some.'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enablePropertyActionButtons).onChange(async (value) => {
					this.plugin.settings.enablePropertyActionButtons = value;
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
			input.addEventListener("change", () => {
				void addCustomColor(input.value).then(() => {
					// Opening the OS colour panel can leave the settings pane emptied —
					// reported on 1.13.4, where the tab stays selected with nothing in it
					// until you click it again. Not reproducible without a human hand on
					// the mouse (a synthesized click doesn't open the panel), so rather
					// than guess at the cause, the pane rebuilds itself when it comes
					// back to an empty container.
					if (containerEl.childElementCount === 0) this.display();
					else render();
				});
			});
		};
		render();
	}
}
