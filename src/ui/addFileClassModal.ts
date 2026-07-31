/*
 * fileClass chooser (ARCHITECTURE.md §10, P1). A suggester to bind a fileClass
 * to the current note by writing its frontmatter alias. Frontmatter-only via
 * processFrontMatter (D2); a single value stays a scalar, multiple become a list.
 */
import { Notice, SuggestModal, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";

export class AddFileClassModal extends SuggestModal<string> {
	constructor(private readonly plugin: FileclassPlugin, private readonly file: TFile) {
		super(plugin.app);
		this.setPlaceholder("Select a fileClass to add");
	}

	getSuggestions(query: string): string[] {
		const alreadyBound = new Set(this.plugin.index.bindingFor(this.file).innerNames);
		const q = query.toLowerCase();
		return this.plugin.index.fileClassNames
			.filter((name) => !alreadyBound.has(name) && name.toLowerCase().includes(q))
			.sort();
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	onChooseSuggestion(item: string): void {
		void this.addFileClass(item);
	}

	private async addFileClass(name: string): Promise<void> {
		if (!this.plugin.index.getFileClass(name)) {
			new Notice(`Fileclass: "${name}" not found.`);
			return;
		}
		const alias = this.plugin.settings.fileClassAlias;
		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm) => {
				const fmRec = fm as Record<string, unknown>;
				const current = fmRec[alias];
				const names: string[] = Array.isArray(current)
					? (current as unknown[]).map((n) => String(n))
					: typeof current === "string" && current.trim()
						? current.split(",").map((n) => n.trim())
						: [];
				if (!names.includes(name)) names.push(name);
				fmRec[alias] = names.length === 1 ? names[0] : names;
			});
		} catch (err) {
			new Notice(`Fileclass: could not add "${name}" (${(err as Error).message}).`);
			return;
		}
		if (this.plugin.settings.insertFieldsOnBind) await this.insertFieldsOf(name);
	}

	/**
	 * Adds the newly bound class's missing fields. The index rebuilds on a debounce
	 * after the frontmatter write, so this waits for the binding to be visible
	 * rather than inserting from a stale resolution — and gives up quietly if it
	 * never becomes visible, leaving the explicit command available.
	 */
	private async insertFieldsOf(name: string): Promise<void> {
		const bound = await this.waitForBinding(name);
		if (!bound) return;
		const fields = this.plugin.index.getFields(this.file);
		if (fields.length) await insertMissingFields(this.app, this.file, fields, { silent: true });
	}

	/** Polls until the index sees `name` on this note (or ~2s has passed). */
	private async waitForBinding(name: string, timeout = 2000): Promise<boolean> {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			if (this.plugin.index.getFileClasses(this.file).includes(name)) return true;
			await new Promise((r) => window.setTimeout(r, 100));
		}
		return false;
	}
}
