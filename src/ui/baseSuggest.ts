/*
 * Autocomplete for a `.base` file and one of its views, on settings text inputs
 * (ARCHITECTURE.md §20.3). Uses the core AbstractInputSuggest; views are read
 * through the adapter's `listBaseViews` (§6).
 */
import { AbstractInputSuggest, App } from "obsidian";

import { listBaseViews } from "../engine/basesAdapter";

export class BaseFileSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, private readonly inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter((f) => f.extension === "base" && f.path.toLowerCase().includes(q))
			.map((f) => f.path);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.inputEl.trigger("input");
		this.close();
	}
}

/** Autocomplete for a `.canvas` file path (Canvas field family). */
export class CanvasFileSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, private readonly inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter((f) => f.extension === "canvas" && f.path.toLowerCase().includes(q))
			.map((f) => f.path);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.inputEl.trigger("input");
		this.close();
	}
}

export class BaseViewSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		private readonly inputEl: HTMLInputElement,
		private readonly getBasePath: () => string
	) {
		super(app, inputEl);
	}

	protected async getSuggestions(query: string): Promise<string[]> {
		const base = this.getBasePath();
		if (!base) return [];
		try {
			const q = query.toLowerCase();
			return (await listBaseViews(this.app, base)).filter((v) => v.toLowerCase().includes(q));
		} catch {
			return [];
		}
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.inputEl.trigger("input");
		this.close();
	}
}
