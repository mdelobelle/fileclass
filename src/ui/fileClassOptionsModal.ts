/*
 * fileClass options editor (ARCHITECTURE.md §20.1). Edits a fileClass's options
 * and writes them in one processFrontMatter on Save, leaving `fields` and other
 * keys untouched. Reads current values from the live frontmatter (fresh).
 */
import { ButtonComponent, Modal, Setting, TFile, debounce, normalizePath, parseYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import { isRootField } from "../schema/field";
import { parseFileClass } from "../schema/fileClass";
import { writeOptions } from "../schema/fileClassIo";
import { buildOptionUpdates, EditableOptions } from "../schema/fileClassWrite";
import { applyBaseSync } from "../views/baseSync";
import { isBaseViewSynced } from "../views/baseYaml";
import { BaseFileSuggest } from "./baseSuggest";
import { IconSuggest, paintIcon } from "./iconSuggest";
import { makeStickyFooter } from "./modalFooter";

const csv = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);

export class FileClassOptionsModal extends Modal {
	private readonly opts: EditableOptions;
	private statusBtn?: ButtonComponent;
	private readonly refreshStatus = debounce(() => void this.updateStatus(), 250, true);

	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly name: string,
		private readonly file: TFile
	) {
		super(plugin.app);
		const parsed = parseFileClass(name, this.app.metadataCache.getFileCache(file)?.frontmatter);
		const o = parsed.options;
		this.opts = {
			icon: o.icon,
			extends: o.extends,
			baseFile: o.baseFile,
			baseView: o.baseView,
			mapWithTag: o.mapWithTag,
			tagNames: o.tagNames,
			filesPaths: o.filesPaths,
			bookmarksGroups: o.bookmarksGroups,
			excludes: o.excludes,
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Options — ${this.name}` });

		const iconSetting = new Setting(contentEl).setName("Icon").setDesc("Lucide icon name.");
		const preview = iconSetting.controlEl.createSpan({ cls: "fileclass-icon-preview" });
		const fallback = this.plugin.settings.fileClassIcon;
		const paintPreview = (v: string) => paintIcon(preview, v.trim() || fallback);
		iconSetting.addText((t) => {
			t.setValue(this.opts.icon ?? "").onChange((v) => {
				this.opts.icon = v;
				paintPreview(v);
			});
			new IconSuggest(this.app, t.inputEl);
		});
		paintPreview(this.opts.icon ?? "");

		new Setting(contentEl)
			.setName("Extends")
			.setDesc("Parent fileClass name.")
			.addText((t) => t.setValue(this.opts.extends ?? "").onChange((v) => (this.opts.extends = v)));

		new Setting(contentEl).setName("Sync to base").setHeading();
		new Setting(contentEl)
			.setName("Base file")
			.setDesc("A .base whose managed view mirrors this fileClass's fields. Blank to disable.")
			.addText((t) => {
				t.setValue(this.opts.baseFile ?? "").onChange((v) => {
					this.opts.baseFile = v;
					this.refreshStatus();
				});
				new BaseFileSuggest(this.app, t.inputEl);
			});
		new Setting(contentEl)
			.setName("View name")
			.setDesc(`Managed view in the base (default: ${this.name}).`)
			.addText((t) =>
				t.setValue(this.opts.baseView ?? "").onChange((v) => {
					this.opts.baseView = v;
					this.refreshStatus();
				})
			);
		new Setting(contentEl)
			.setName("Base structure")
			.setDesc("Whether the managed view matches the fileClass fields.")
			.addButton((b) => {
				this.statusBtn = b;
				b.onClick(() => void this.doSync());
			});

		new Setting(contentEl)
			.setName("Map with tag")
			.setDesc("Bind notes tagged with this fileClass's name.")
			.addToggle((t) =>
				t.setValue(!!this.opts.mapWithTag).onChange((v) => (this.opts.mapWithTag = v))
			);

		this.csvSetting("Tag names", "tagNames");
		this.csvSetting("Files paths", "filesPaths");
		this.csvSetting("Bookmark groups", "bookmarksGroups");
		this.csvSetting("Excludes", "excludes", "Inherited field names to drop.");

		new Setting(makeStickyFooter(contentEl)).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					await writeOptions(this.app, this.file, buildOptionUpdates(this.opts));
					this.close();
				})
		);

		void this.updateStatus();
	}

	/** Sync status of the managed view against the form's current base/view. */
	private async computeStatus(): Promise<"none" | "synced" | "diverged"> {
		const baseFile = this.opts.baseFile?.trim();
		if (!baseFile) return "none";
		const file = this.app.vault.getFileByPath(normalizePath(baseFile));
		if (!(file instanceof TFile)) return "diverged"; // missing → Sync creates it
		try {
			const base: unknown = parseYaml(await this.app.vault.read(file));
			const view = this.opts.baseView?.trim() || this.name;
			const fields = this.plugin.index
				.getResolvedFields(this.name)
				.filter((f) => isRootField(f))
				.map((f) => f.name);
			return isBaseViewSynced(base, view, fields) ? "synced" : "diverged";
		} catch {
			return "diverged";
		}
	}

	private async updateStatus(): Promise<void> {
		if (!this.statusBtn) return;
		const status = await this.computeStatus();
		const b = this.statusBtn;
		if (status === "none") b.setButtonText("No base set").setDisabled(true).removeCta();
		else if (status === "synced") b.setButtonText("Synced").setDisabled(true).removeCta();
		else b.setButtonText("Sync").setDisabled(false).setCta();
	}

	private async doSync(): Promise<void> {
		const path = this.opts.baseFile?.trim();
		if (!path) return;
		// Persist config, then apply with explicit path/view (cache may lag).
		await writeOptions(this.app, this.file, buildOptionUpdates(this.opts));
		await applyBaseSync(
			this.plugin,
			this.name,
			normalizePath(path),
			this.opts.baseView?.trim() || this.name
		);
		await this.updateStatus();
	}

	private csvSetting(
		name: string,
		key: "tagNames" | "filesPaths" | "bookmarksGroups" | "excludes",
		desc = "Comma-separated."
	): void {
		new Setting(this.contentEl)
			.setName(name)
			.setDesc(desc)
			.addText((t) =>
				t.setValue((this.opts[key] ?? []).join(", ")).onChange((v) => (this.opts[key] = csv(v)))
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
