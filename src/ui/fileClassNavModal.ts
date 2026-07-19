/*
 * Navigation choices for a fileClass, opened from the note-fields modal footer
 * breadcrumb. Two actions: open the fileClass's settings (schema editor), or go
 * to its base view — creating one if none exists yet. The base action closes the
 * parent note-fields modal (via `closeParent`) before navigating away.
 */
import { Modal, Setting } from "obsidian";

import type FileclassPlugin from "../../main";
import { pickAndCreateBase } from "../views/baseFileGenerator";
import { fileClassBaseFile, openFileClassBase } from "../views/baseSync";
import { openFileClassSchema } from "./fileClassSchemaModal";

export class FileClassNavModal extends Modal {
	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly name: string,
		private readonly closeParent: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.name });

		new Setting(contentEl)
			.setName("Open fileClass settings")
			.setDesc("Manage its options and fields.")
			.addButton((b) =>
				b
					.setIcon("wrench")
					.setTooltip("Open settings")
					.onClick(() => {
						this.close();
						openFileClassSchema(this.plugin, this.name);
					})
			);

		const hasBase = !!fileClassBaseFile(this.plugin, this.name);
		new Setting(contentEl)
			.setName(hasBase ? "Open base view" : "Create base view")
			.setDesc(
				hasBase
					? "Close this modal and open the fileClass's base."
					: "Close this modal and set up a base for this fileClass."
			)
			.addButton((b) =>
				b
					.setCta()
					.setButtonText(hasBase ? "Open" : "Create")
					.onClick(() => {
						this.close();
						this.closeParent();
						if (hasBase) openFileClassBase(this.plugin, this.name);
						else pickAndCreateBase(this.plugin, this.name);
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
