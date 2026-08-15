/*
 * One field, two views read backwards from it.
 *
 *   node demo/probe.mjs 901 demo/two-related-views-probe.mjs
 *
 * Declares two views over `Book.author`, embeds both in an author's note, and checks that each
 * carries the New button **and** seeds the relation — the case a single declaration per field made
 * impossible: adopting the second used to replace the first.
 *
 * The New button's listener sits on the inner `.text-icon-button`, not on the toolbar item around
 * it; clicking the item measured "nothing happens" for one run of this probe.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("setup", await page.evaluate(async () => {
		const app = window.app;
		app.changeTheme?.("obsidian"); app.customCss?.setTheme?.("Minimal");
		// Two views over Book.author read backwards: one for read books, one for unread.
		const base = app.vault.getAbstractFileByPath("Books.base");
		const yaml = await app.vault.read(base);
		const block = (name, extra) =>
			`  - type: fileclass-table\n    name: ${name}\n    filters:\n      and:\n        - fileClass.containsAny("Book")\n        - author.contains(this.file.asLink())\n${extra}    order:\n      - file.name\n      - genre\n`;
		await app.vault.modify(base, `${yaml}${block("Author's read books", '        - read == true\n')}${block("Author's unread books", '        - read == false\n')}`);
		// Both declared on Book, for the same field.
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath("Classes/Book.md"), (fm) => {
			fm.relatedViews = [
				{ field: "author", view: "Books.base#Author's read books" },
				{ field: "author", view: "Books.base#Author's unread books" },
			];
		});
		await new Promise((r) => setTimeout(r, 3000));
		return app.plugins.plugins.fileclass.index.getFileClass("Book")?.options.relatedViews;
	}));

	// Embed both in an Author note.
	note("embedded", await page.evaluate(async () => {
		const app = window.app;
		const host = app.vault.getAbstractFileByPath("Frank Herbert.md");
		const text = await app.vault.read(host);
		await app.vault.modify(host, `${text}\n\n![[Books.base#Author's read books]]\n\n![[Books.base#Author's unread books]]\n`);
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(host);
		await leaf.setViewState({ type: "markdown", state: { file: host.path, mode: "preview" } });
		await new Promise((r) => setTimeout(r, 6000));
		const embeds = Array.from(document.querySelectorAll(".markdown-reading-view .internal-embed"));
		return embeds.map((e) => ({
			src: e.getAttribute("src"),
			buttons: Array.from(e.querySelectorAll(".bases-toolbar-item")).map((b) => b.textContent.trim()).filter((t) => /New|Manage/.test(t)),
		}));
	}));

	note("New from the second view seeds the relation", await page.evaluate(async () => {
		const embeds = Array.from(document.querySelectorAll(".markdown-reading-view .internal-embed"));
		const second = embeds[1];
		// The listener is on the inner text-icon-button, not on the toolbar item around it.
		const button = second?.querySelector(".fileclass-toolbar-new .text-icon-button");
		if (!button) return "(no New button on the second embed)";
		button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 1800));
		const opened = {
			modal: document.querySelector(".modal")?.textContent?.slice(0, 40) ?? null,
			prompt: !!document.querySelector(".prompt"),
			inputs: document.querySelectorAll(".modal input[type=text], .prompt-input").length,
		};

		const input = document.querySelector(".prompt-input, .modal input[type=text]");
		if (input) {
			input.value = "Seeded from unread";
			input.dispatchEvent(new Event("input"));
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		}
		await new Promise((r) => setTimeout(r, 3000));
		const made = window.app.vault.getMarkdownFiles().find((f) => f.basename === "Seeded from unread");
		return {
			opened,
			frontmatter: made ? window.app.metadataCache.getFileCache(made)?.frontmatter : null,
			stillOpen: document.querySelector(".modal")?.textContent?.slice(0, 40) ?? null,
		};
	}));
}
