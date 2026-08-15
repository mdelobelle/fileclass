/*
 * The flow a reader actually types: a list, Enter, another value, Enter, another (#185).
 *
 *   node demo/probe.mjs 901 demo/frontmatter-list-flow-probe.mjs
 *
 * The case that matters, and the one to keep honest: from `  - Religion`, Enter continues the list
 * with `  - ` on its own, the value typed there opens the suggester, and choosing it leaves **one**
 * dash — the one Obsidian wrote. Three values in a row, one Enter each.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("start", await page.evaluate(async () => {
		const app = window.app;
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath("Dune.md"), (fm) => { fm.themes = ["Religion"]; });
		await new Promise((r) => setTimeout(r, 1500));
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Dune.md"));
		await leaf.setViewState({ type: "markdown", state: { file: "Dune.md", mode: "source", source: true } });
		await new Promise((r) => setTimeout(r, 2500));
		const editor = app.workspace.activeEditor.editor;
		const at = editor.getValue().split("\n").findIndex((l) => l.startsWith("themes:"));
		editor.setCursor({ line: at + 1, ch: editor.getLine(at + 1).length });
		editor.focus();
		return { at, block: [editor.getLine(at), editor.getLine(at + 1)] };
	}));
	await page.keyboard.press("Enter");
	await sleep(500);
	await page.keyboard.type("Eco", { delay: 90 });
	await sleep(1300);
	note("before choosing", await page.evaluate(() => {
		const editor = window.app.workspace.activeEditor.editor;
		const c = editor.getCursor();
		return {
			line: JSON.stringify(editor.getLine(c.line)),
			offered: Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim()),
		};
	}));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("after choosing — the whole block", await page.evaluate(() => {
		const app = window.app;
		const editor = app.workspace.activeEditor.editor;
		const lines = editor.getValue().split("\n");
		const at = lines.findIndex((l) => l.startsWith("themes:"));
		return {
			lines: lines.slice(at, at + 4).map((l) => JSON.stringify(l)),
			cached: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.themes,
			cursor: editor.getCursor(),
		};
	}));
	// A third one, to see the flow repeat.
	await page.keyboard.press("Enter");
	await sleep(500);
	await page.keyboard.type("Pol", { delay: 90 });
	await sleep(1300);
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("and a third", await page.evaluate(() => {
		const app = window.app;
		const lines = app.workspace.activeEditor.editor.getValue().split("\n");
		const at = lines.findIndex((l) => l.startsWith("themes:"));
		return {
			lines: lines.slice(at, at + 5).map((l) => JSON.stringify(l)),
			cached: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.themes,
		};
	}));
}
