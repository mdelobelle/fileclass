/*
 * fileClass chooser (ARCHITECTURE.md §10, P1). A suggester to bind a fileClass
 * to the current note by writing its frontmatter alias. Frontmatter-only via
 * processFrontMatter (D2); a single value stays a scalar, multiple become a list.
 */
import { Notice, SuggestModal, TFile } from "obsidian";

import type FileclassPlugin from "../../main";

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
		const alias = this.plugin.settings.fileClassAlias;
		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm) => {
				const current = fm[alias];
				const names = Array.isArray(current)
					? [...current]
					: typeof current === "string" && current.trim()
						? current.split(",").map((n: string) => n.trim())
						: [];
				if (!names.includes(name)) names.push(name);
				fm[alias] = names.length === 1 ? names[0] : names;
			});
		} catch (err) {
			new Notice(`Fileclass: could not add "${name}" (${(err as Error).message}).`);
		}
	}
}
