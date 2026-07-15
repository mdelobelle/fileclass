/*
 * Folder-path autocomplete for a settings text input. Uses Obsidian's built-in
 * AbstractInputSuggest (since 1.4.10; our minAppVersion is 1.13.2) rather than a
 * bespoke suggester — no extra infra to maintain.
 */
import { AbstractInputSuggest, App, TFolder } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private readonly inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllFolders(false)
			.filter((folder) => folder.path.toLowerCase().includes(q));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		// Write the value and fire the input event so the Setting's onChange runs.
		this.setValue(folder.path);
		this.inputEl.trigger("input");
		this.close();
	}
}
