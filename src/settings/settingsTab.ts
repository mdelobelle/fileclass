/*
 * Settings tab (ARCHITECTURE.md §4). Minimal for P1: the folder holding
 * fileClass notes, the binding alias, and the optional global fileClass.
 * Sentence-case headings and bold literal UI labels per Obsidian guidelines.
 */
import { App, PluginSettingTab, Setting, setIcon } from "obsidian";

import { attachFormatPreview } from "../ui/dateFormatPreview";

import type FileclassPlugin from "../../main";
import { addCustomColor, removeCustomColor } from "../fields/customPalette";
import { colorCircleInput } from "../ui/colorInput";
import { applyDraggableModals } from "../ui/modalDrag";
import { FolderSuggest } from "../ui/folderSuggest";
import { UnknownKeysPosition } from "../schema/reorder";
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

		/*
		 * A list, not a text box, for the same reason `Extends` became one: a name that is not
		 * a fileClass binds nothing and says nothing, and the set of valid answers is known.
		 * A value that no longer resolves — a class renamed or deleted — is kept in the list
		 * and marked rather than silently reset, since dropping it would quietly untype every
		 * note in the vault that had nothing else.
		 */
		new Setting(containerEl)
			.setName("Global fileClass")
			.setDesc(
				"A baseline carried by every note, on top of the classes it names itself; " +
					"the note's own class wins any field both declare. Not applied to the class folder."
			)
			.addDropdown((dropdown) => {
				const current = this.plugin.settings.globalFileClass.trim();
				dropdown.addOption("", "— none —");
				for (const name of [...this.plugin.index.fileClassNames].sort((a, b) =>
					a.localeCompare(b)
				)) {
					dropdown.addOption(name, name);
				}
				if (current && !this.plugin.index.fileClassNames.includes(current)) {
					dropdown.addOption(current, `${current} (no such fileClass)`);
				}
				dropdown.setValue(current).onChange(async (value) => {
					this.plugin.settings.globalFileClass = value;
					await this.plugin.saveSettings();
					this.plugin.index.rebuild();
				});
			});

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
			.setName("Schema canvas")
			.setDesc(
				"Where Draw the schema canvas writes. Blank uses <class folder>/Schema.canvas. " +
					"The file is yours to arrange afterwards: a sync keeps every position it finds."
			)
			.addText((text) =>
				text
					.setPlaceholder("Classes/Schema.canvas")
					.setValue(this.plugin.settings.schemaCanvasPath)
					.onChange(async (value) => {
						this.plugin.settings.schemaCanvasPath = value;
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
			.setName("Open the fields when creating a note")
			.setDesc(
				"After Fileclass creates a note with a class, open its fields modal so the values can be " +
					"filled straight away. The fields themselves are always inserted."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.openFieldsOnCreate).onChange(async (value) => {
					this.plugin.settings.openFieldsOnCreate = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Schema log")
			.setDesc(
				"Record in <class folder>/fileclass.log what leaves a fileClass pointing at something " +
					"that moved. Fileclass never edits a definition itself."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableSchemaLog).onChange(async (value) => {
					this.plugin.settings.enableSchemaLog = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Schema log size")
			.setDesc(
				"Entries the live log keeps before rolling over to <class folder>/.logs/archive_NNNN.log. " +
					"0 lets it grow."
			)
			.addText((t) =>
				t
					.setPlaceholder("500")
					.setValue(String(this.plugin.settings.schemaLogMaxEntries))
					.onChange(async (value) => {
						const n = Number.parseInt(value, 10);
						this.plugin.settings.schemaLogMaxEntries = Number.isFinite(n) && n >= 0 ? n : 0;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Archives kept")
			.setDesc("How many rolled-over log files to keep. 0 discards the overflow instead.")
			.addText((t) =>
				t
					.setPlaceholder("5")
					.setValue(String(this.plugin.settings.schemaLogArchives))
					.onChange(async (value) => {
						const n = Number.parseInt(value, 10);
						this.plugin.settings.schemaLogArchives = Number.isFinite(n) && n >= 0 ? n : 0;
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

		/*
		 * #104. `processFrontMatter` appends, so inserting a note's missing fields lands them
		 * after whatever it already carried — which is where the disorder the users report is
		 * created. Off by default all the same: it rewrites the whole block, so it touches
		 * lines nobody asked to edit and it shows up in a git diff.
		 */
		new Setting(containerEl)
			.setName("Reorder frontmatter when inserting fields")
			.setDesc(
				"After Insert missing fields, put the note's properties back in the order its class declares them. " +
					"Rewrites the whole frontmatter block, which drops YAML comments — as any property write already does. " +
					"The command Reorder frontmatter to match the class does it on demand, whatever this says."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.reorderOnInsert).onChange(async (value) => {
					this.plugin.settings.reorderOnInsert = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Keys your classes don't declare")
			.setDesc(
				"Where a reorder puts properties no class knows about — tags, aliases, cssclasses, the fileClass key, anything hand-written."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						top: "First — where tags and aliases already sit",
						bottom: "Last — after everything the class declares",
						"keep-relative": "Where they are — only the class's keys move",
					})
					.setValue(this.plugin.settings.unknownKeysPosition)
					.onChange(async (value) => {
						this.plugin.settings.unknownKeysPosition = value as UnknownKeysPosition;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Movable modals (experimental)")
			.setDesc(
				"Drag a modal by its title, offset each modal opening over another, dim the app once " +
					"instead of once per modal, and let every modal of a stack be clicked — not only the " +
					"topmost. It works by neutralising Obsidian's own modal backdrops, which other plugins " +
					"share, so it is off by default. Desktop only. While modals are stacked, clicking " +
					"outside them closes nothing (Escape still closes the top one)."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableDraggableModals).onChange(async (value) => {
					this.plugin.settings.enableDraggableModals = value;
					await this.plugin.saveSettings();
					applyDraggableModals(value);
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
			.setName("Values while typing in the frontmatter")
			.setDesc(
				"In source mode, offer a field's allowed values as you type one — Select, Cycle and Multi, " +
					"the types that have a list to choose from. The candidates are the ones the pickers build, " +
					"and the value is written the usual way. Without it, the editor is the one place a value " +
					"goes in unchecked."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableFrontmatterSuggest).onChange(async (value) => {
					this.plugin.settings.enableFrontmatterSuggest = value;
					await this.plugin.saveSettings();
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
			colorCircleInput(paletteEl, {
				label: "Add color",
				cls: "is-add",
				badge: "plus",
				onPick: (value) => void addCustomColor(value).then(render),
			});
		};
		render();
	}
}
