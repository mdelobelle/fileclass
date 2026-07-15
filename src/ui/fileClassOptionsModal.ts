/*
 * fileClass options editor (ARCHITECTURE.md §20.1). Edits a fileClass's options
 * and writes them in one processFrontMatter on Save, leaving `fields` and other
 * keys untouched. Reads current values from the live frontmatter (fresh).
 */
import { Modal, Setting, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { parseFileClass } from "../schema/fileClass";
import { writeOptions } from "../schema/fileClassIo";
import { buildOptionUpdates, EditableOptions } from "../schema/fileClassWrite";

const csv = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);

export class FileClassOptionsModal extends Modal {
	private readonly opts: EditableOptions;

	constructor(
		plugin: FileclassPlugin,
		private readonly name: string,
		private readonly file: TFile
	) {
		super(plugin.app);
		const parsed = parseFileClass(name, this.app.metadataCache.getFileCache(file)?.frontmatter);
		const o = parsed.options;
		this.opts = {
			icon: o.icon,
			extends: o.extends,
			limit: o.limit,
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

		new Setting(contentEl)
			.setName("Icon")
			.setDesc("Lucide icon name.")
			.addText((t) => t.setValue(this.opts.icon ?? "").onChange((v) => (this.opts.icon = v)));

		new Setting(contentEl)
			.setName("Extends")
			.setDesc("Parent fileClass name.")
			.addText((t) => t.setValue(this.opts.extends ?? "").onChange((v) => (this.opts.extends = v)));

		new Setting(contentEl).setName("Limit").addText((t) =>
			t.setValue(this.opts.limit != null ? String(this.opts.limit) : "").onChange((v) => {
				const n = Number(v.trim());
				this.opts.limit = v.trim() && Number.isFinite(n) ? n : undefined;
			})
		);

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

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					await writeOptions(this.app, this.file, buildOptionUpdates(this.opts));
					this.close();
				})
		);
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
