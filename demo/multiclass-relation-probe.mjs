/*
 * A relation view about several classes: what its New button can promise.
 *
 *   node demo/probe.mjs 901 demo/multiclass-relation-probe.mjs
 *
 * The table cannot say *what* it will create — `containsAny("Book", "Comic")` decides nothing — but
 * if the view is a declared relation it can say what the note will be linked **to**. Both halves are
 * measured here: creating with the class that reads this view backwards seeds the link, creating
 * with the one that does not makes an ordinary note, which is what the tooltip says.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("setup", await page.evaluate(async () => {
		const app = window.app;
		app.changeTheme?.("moonstone"); app.customCss?.setTheme?.("Minimal");
		// A view about two classes, declared as Book.author read backwards.
		const base = app.vault.getAbstractFileByPath("Books.base");
		const yaml = await app.vault.read(base);
		await app.vault.modify(base, `${yaml}  - type: fileclass-table\n    name: Author's works\n    filters:\n      and:\n        - fileClass.containsAny("Book", "Comic")\n        - author.contains(this.file.asLink())\n    order:\n      - file.name\n      - genre\n`);
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath("Classes/Book.md"), (fm) => {
			fm.relatedViews = [{ field: "author", view: "Books.base#Author's works" }];
		});
		await new Promise((r) => setTimeout(r, 3000));
		const host = app.vault.getAbstractFileByPath("Frank Herbert.md");
		const text = await app.vault.read(host);
		await app.vault.modify(host, `${text}\n\n![[Books.base#Author's works]]\n`);
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(host);
		await leaf.setViewState({ type: "markdown", state: { file: host.path, mode: "preview" } });
		await new Promise((r) => setTimeout(r, 6000));
		return true;
	}));
	note("buttons", await page.evaluate(() => {
		const embed = document.querySelector(".markdown-reading-view .internal-embed");
		return {
			labels: Array.from(embed?.querySelectorAll(".bases-toolbar-item") ?? []).map((b) => b.textContent.trim()).filter((t) => /New|Manage/.test(t)),
			tooltip: embed?.querySelector(".fileclass-toolbar-new")?.getAttribute("aria-label"),
		};
	}));
	note("creating from it", await page.evaluate(async () => {
		const embed = document.querySelector(".markdown-reading-view .internal-embed");
		embed?.querySelector(".fileclass-toolbar-new .text-icon-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 1600));
		// Which class? — the question a multi-class table asks.
		const items = Array.from(document.querySelectorAll(".suggestion-item"));
		const asked = items.map((e) => e.textContent.trim());
		items.find((e) => e.textContent.trim() === "Book")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 1600));
		const input = document.querySelector(".modal input[type=text], .prompt-input");
		if (input) {
			input.value = "From a two-class view";
			input.dispatchEvent(new Event("input"));
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		}
		await new Promise((r) => setTimeout(r, 3000));
		const made = window.app.vault.getMarkdownFiles().find((f) => f.basename === "From a two-class view");
		const fm = made ? window.app.metadataCache.getFileCache(made)?.frontmatter : null;
		return { asked, fileClass: fm?.fileClass, author: fm?.author };
	}));
	// The other half of what the tooltip says: a class of this table that does **not** declare the
	// view creates a note without the link, rather than one wrongly linked.
	note("and with the class that does not declare it", await page.evaluate(async () => {
		// The note created above opened in a popover; close whatever is on top before starting over.
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await new Promise((r) => setTimeout(r, 1200));
		const leaf = window.app.workspace.getLeaf(false);
		await leaf.openFile(window.app.vault.getAbstractFileByPath("Frank Herbert.md"));
		await leaf.setViewState({ type: "markdown", state: { file: "Frank Herbert.md", mode: "preview" } });
		await new Promise((r) => setTimeout(r, 5000));
		const embed = document.querySelector(".markdown-reading-view .internal-embed");
		embed?.querySelector(".fileclass-toolbar-new .text-icon-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 1600));
		Array.from(document.querySelectorAll(".suggestion-item")).find((e) => e.textContent.trim() === "Comic")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 1600));
		const input = document.querySelector(".modal input[type=text], .prompt-input");
		if (input) {
			input.value = "A comic from the same view";
			input.dispatchEvent(new Event("input"));
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		}
		await new Promise((r) => setTimeout(r, 3000));
		const made = window.app.vault.getMarkdownFiles().find((f) => f.basename === "A comic from the same view");
		const fm = made ? window.app.metadataCache.getFileCache(made)?.frontmatter : null;
		return { fileClass: fm?.fileClass, author: fm?.author ?? "(no author field)", contributors: fm?.contributors };
	}));
}
