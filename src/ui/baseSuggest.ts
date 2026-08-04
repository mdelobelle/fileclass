/*
 * Autocomplete for a `.base` file and one of its views, on settings text inputs
 * (ARCHITECTURE.md §20.3). Uses the core AbstractInputSuggest; views are read
 * through the adapter's `listBaseViews` (§6).
 */
import { AbstractInputSuggest, App } from "obsidian";

import { getBaseRows, listBaseViews } from "../engine/basesAdapter";

/**
 * Shared behaviour for the plugin's input suggesters: render a plain string, and
 * on select write the value, tell the setting about it, and close.
 *
 * The `input` event is what the setting listens to, and it is also what makes
 * AbstractInputSuggest re-query. For a synchronous source that re-query resolves
 * before `close()` runs, so the popover ends up shut. For an **awaited** one it
 * resolves after, and the popover reopens on the value just chosen — which is why
 * the View and Display-column fields stayed open while Base file behaved. Hence
 * `justChose`: the query that the select itself triggers returns nothing.
 */
abstract class InputSuggest extends AbstractInputSuggest<string> {
	/** Set for one turn of the event loop, spanning the re-query. */
	private justChose = false;

	constructor(app: App, protected readonly inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	/** Async subclasses call this first in getSuggestions(). */
	protected get chosen(): boolean {
		return this.justChose;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.justChose = true;
		this.setValue(value);
		this.inputEl.trigger("input");
		this.close();
		window.setTimeout(() => (this.justChose = false), 0);
	}

	/** Vault paths with `extension`, filtered by the query (case-insensitive). */
	protected filesByExtension(extension: string, query: string): string[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter((f) => f.extension === extension && f.path.toLowerCase().includes(q))
			.map((f) => f.path);
	}
}

export class BaseFileSuggest extends InputSuggest {
	protected getSuggestions(query: string): string[] {
		return this.filesByExtension("base", query);
	}
}

/** Autocomplete for a `.canvas` file path (Canvas field family). */
export class CanvasFileSuggest extends InputSuggest {
	protected getSuggestions(query: string): string[] {
		return this.filesByExtension("canvas", query);
	}
}

/** Autocomplete for a markdown-note path (e.g. a `valuesListNotePath` source). */
export class NoteFileSuggest extends InputSuggest {
	protected getSuggestions(query: string): string[] {
		return this.filesByExtension("md", query);
	}
}

export class BaseViewSuggest extends InputSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly getBasePath: () => string
	) {
		super(app, inputEl);
	}

	protected async getSuggestions(query: string): Promise<string[]> {
		if (this.chosen) return [];
		const base = this.getBasePath();
		if (!base) return [];
		try {
			const q = query.toLowerCase();
			return (await listBaseViews(this.app, base)).filter((v) => v.toLowerCase().includes(q));
		} catch {
			return [];
		}
	}
}

/** Autocomplete for a column id of a base view (`file.name`, `note.title`, …). */
export class BaseColumnSuggest extends InputSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly getBasePath: () => string,
		private readonly getViewName: () => string
	) {
		super(app, inputEl);
	}

	protected async getSuggestions(query: string): Promise<string[]> {
		if (this.chosen) return [];
		const base = this.getBasePath();
		if (!base) return [];
		try {
			const q = query.toLowerCase();
			const result = await getBaseRows(this.app, base, this.getViewName() || undefined);
			return result.columns.filter((c) => c.toLowerCase().includes(q));
		} catch {
			return [];
		}
	}
}
