/*
 * Lucide-icon autocomplete for a settings text input, each suggestion showing
 * its glyph. Uses Obsidian's built-in AbstractInputSuggest and its icon registry
 * (getIconIds/setIcon) — no bundled icon list to maintain.
 */
import { AbstractInputSuggest, App, getIconIds, setIcon } from "obsidian";

const LUCIDE_PREFIX = "lucide-";

/** Available icon names, plain-named to match how the plugin calls setIcon. */
export function availableIconNames(): string[] {
	const ids = getIconIds();
	const lucide = ids.filter((id) => id.startsWith(LUCIDE_PREFIX));
	const names = lucide.length ? lucide.map((id) => id.slice(LUCIDE_PREFIX.length)) : ids;
	return [...new Set(names)].sort();
}

/** Renders `name` into `el` as its glyph, falling back to a not-found icon. */
export function paintIcon(el: HTMLElement, name: string): void {
	el.empty();
	setIcon(el, name);
	const missing = !el.querySelector("svg");
	if (missing) setIcon(el, "file-question");
	el.toggleClass("fileclass-icon-missing", missing);
}

export class IconSuggest extends AbstractInputSuggest<string> {
	private readonly names = availableIconNames();

	constructor(app: App, private readonly inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase().trim();
		const list = q ? this.names.filter((n) => n.includes(q)) : this.names;
		return list.slice(0, 50);
	}

	renderSuggestion(name: string, el: HTMLElement): void {
		el.addClass("fileclass-icon-suggestion");
		setIcon(el.createSpan({ cls: "fileclass-icon-suggestion-pic" }), name);
		el.createSpan({ text: name });
	}

	selectSuggestion(name: string): void {
		this.setValue(name);
		this.inputEl.trigger("input");
		this.close();
	}
}
