/*
 * "Create a base for a fileClass" (ARCHITECTURE.md §11): an interactive setup —
 * pick the base file path and the managed view name — that stores them on the
 * fileClass (`baseFile`/`baseView`) and applies the mirror via the sync path.
 * Non-destructive: an existing base only gets its managed view touched (§11).
 */
import { Modal, Notice, Setting, normalizePath } from "obsidian";

import { modalTitle } from "../ui/modalTitle";

import type FileclassPlugin from "../../main";
import { writeOptions } from "../schema/fileClassIo";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { BaseFileSuggest } from "../ui/baseSuggest";
import { applyBaseSync, fileClassClaimingView, managedViewName } from "./baseSync";

class CreateBaseModal extends Modal {
	private path: string;
	private view: string;

	constructor(private readonly plugin: FileclassPlugin, private readonly name: string) {
		super(plugin.app);
		const declared = plugin.index.getFileClass(name)?.options.baseFile?.trim();
		this.path = declared || `${plugin.settings.basesFolder}${name}.base`;
		this.view = managedViewName(plugin, name);
	}

	onOpen(): void {
		const { contentEl } = this;
		modalTitle(contentEl, `Sync ${this.name} to a base`);

		new Setting(contentEl)
			.setName("Base file")
			.setDesc("New or existing .base to mirror this fileClass's fields into.")
			.addText((t) => {
				t.setValue(this.path).onChange((v) => (this.path = v));
				new BaseFileSuggest(this.app, t.inputEl);
			});
		new Setting(contentEl)
			.setName("View name")
			.setDesc("The managed view (other views in the base are left untouched).")
			.addText((t) => t.setValue(this.view).onChange((v) => (this.view = v)));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Create / sync")
				.setCta()
				.onClick(() => void this.apply())
		);
	}

	private async apply(): Promise<void> {
		let path = this.path.trim();
		if (!path) {
			new Notice("Fileclass: a base file path is required.");
			return;
		}
		if (!path.endsWith(".base")) path += ".base";
		path = normalizePath(path);
		const view = this.view.trim() || this.name;

		// Two classes mirroring into one view would overwrite each other's columns on every
		// sync, quietly and forever. Refused before anything is written, and named: the answer
		// is a different view name, which is one word away in the field above.
		const taken = fileClassClaimingView(this.plugin, path, view, this.name);
		if (taken) {
			new Notice(
				`Fileclass: "${taken}" already mirrors into ${path} › ${view}. ` +
					"Give this one a view name of its own."
			);
			return;
		}

		const fcFile = this.plugin.index.getFileClassFile(this.name);
		if (fcFile) await writeOptions(this.app, fcFile, { baseFile: path, baseView: view });
		// Use explicit path/view — the metadata cache may not reflect the write yet.
		await applyBaseSync(this.plugin, this.name, path, view);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Opens the create/sync setup for `name`, or a fileClass picker when omitted. */
export function pickAndCreateBase(plugin: FileclassPlugin, name?: string): void {
	if (name) {
		new CreateBaseModal(plugin, name).open();
		return;
	}
	const names = plugin.index.fileClassNames;
	if (!names.length) {
		new Notice("Fileclass: no fileClasses defined.");
		return;
	}
	new ChoiceSuggestModal<string>(
		plugin.app,
		[...names].sort(),
		(n) => n,
		(n) => new CreateBaseModal(plugin, n).open(),
		"Select a fileClass to sync to a base"
	).open();
}
