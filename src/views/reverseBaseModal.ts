/*
 * "Where should this view live?" — asked once per relation (#154).
 *
 * Fileclass could put the reverse view in a base named after the class and never mention it, and a
 * vault would then quietly grow a `.base` per class that happens to be pointed at. So the reader
 * chooses, with their existing bases one keystroke away.
 *
 * Asked **only when the view does not exist yet**: from the second note showing the same relation,
 * there is nothing to decide and nothing is asked (see `locateReverseView`).
 */
import { Modal, Notice, Setting, normalizePath } from "obsidian";

import type FileclassPlugin from "../../main";
import { BaseFileSuggest } from "../ui/baseSuggest";
import { modalTitle } from "../ui/modalTitle";

class ReverseBaseModal extends Modal {
	private path: string;
	/** Called once, with the chosen path or null if the reader closed the modal. */
	private settled = false;

	constructor(
		plugin: FileclassPlugin,
		private readonly viewName: string,
		private readonly targetClass: string,
		defaultPath: string,
		private readonly done: (path: string | null) => void
	) {
		super(plugin.app);
		this.path = defaultPath;
	}

	onOpen(): void {
		const { contentEl } = this;
		modalTitle(contentEl, `Where should "${this.viewName}" live?`);

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text:
				`The view selects ${this.targetClass} notes and is created once: every note showing ` +
				"this relation embeds the same one. Point it at a base you already have, or accept a new one.",
		});

		new Setting(contentEl)
			.setName("Base file")
			.setDesc("An existing .base gets one more view; a new path is created.")
			.addText((t) => {
				t.setValue(this.path).onChange((v) => (this.path = v));
				new BaseFileSuggest(this.app, t.inputEl);
				window.setTimeout(() => t.inputEl.select(), 0);
			});

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Create the view")
				.setCta()
				.onClick(() => this.submit())
		);
	}

	private submit(): void {
		let path = this.path.trim();
		if (!path) {
			new Notice("Fileclass: a base file path is required.");
			return;
		}
		if (!path.endsWith(".base")) path += ".base";
		this.settled = true;
		this.done(normalizePath(path));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		// Closing without the button is a cancellation, and nothing should be written.
		if (!this.settled) this.done(null);
	}
}

/** Asks where the view goes; resolves to the chosen path, or null if cancelled. */
export function pickReverseBase(
	plugin: FileclassPlugin,
	viewName: string,
	targetClass: string,
	defaultPath: string
): Promise<string | null> {
	return new Promise((resolve) => {
		new ReverseBaseModal(plugin, viewName, targetClass, defaultPath, resolve).open();
	});
}
