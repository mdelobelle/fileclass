/*
 * fileClass chooser (ARCHITECTURE.md §10, P1). A suggester to bind a fileClass
 * to the current note by writing a wikilink to it into the frontmatter alias.
 * Frontmatter-only via processFrontMatter (D2); a single value stays a scalar,
 * multiple become a list.
 */
import { Notice, SuggestModal, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { mergeFileClassLink } from "./fileClassLinkValue";

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
		if (!this.plugin.index.getFileClass(name)) {
			new Notice(`Fileclass: "${name}" not found.`);
			return;
		}
		// A plain wikilink to the class by name. fileClass names are unique, so no
		// path qualification is needed; a bare `[[name]]` is always captured in
		// `frontmatterLinks` (the read path) and matches the generated base filter,
		// regardless of the vault's markdown-vs-wikilink link setting.
		const link = `[[${name}]]`;
		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm) => {
				const fmRec = fm as Record<string, unknown>;
				const links = mergeFileClassLink(fmRec[alias], link);
				fmRec[alias] = links.length === 1 ? links[0] : links;
			});
		} catch (err) {
			new Notice(`Fileclass: could not add "${name}" (${(err as Error).message}).`);
		}
	}
}
