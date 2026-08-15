/*
 * The space YAML needs, when the reader does not type it (#185).
 *
 *   node demo/probe.mjs 901 demo/frontmatter-spacing-probe.mjs
 *
 * Reported from a real vault: starting to type straight after the `:` and picking a value produced
 * `Status:WaitingFor`, which is not a key and a value at all — it is one scalar string, and the
 * note's frontmatter stops parsing. Same for `-Eco` in a list. What is written back now carries the
 * separator when the line lacks it.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	await page.evaluate(async () => {
		const app = window.app;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Dune.md"));
		await leaf.setViewState({ type: "markdown", state: { file: "Dune.md", mode: "source", source: true } });
		await new Promise((r) => setTimeout(r, 2500));
	});
	// Typing straight after the colon, with no space — the case that produced invalid YAML.
	note("caret right after the colon", await page.evaluate(() => {
		const editor = window.app.workspace.activeEditor.editor;
		const at = editor.getValue().split("\n").findIndex((l) => l.startsWith("genre:"));
		editor.setLine(at, "genre:");
		editor.setCursor({ line: at, ch: 6 });
		editor.focus();
		return JSON.stringify(editor.getLine(at));
	}));
	await page.keyboard.type("Sci", { delay: 90 });
	await sleep(1300);
	note("offered", await page.evaluate(() => Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim())));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("after choosing", await page.evaluate(() => {
		const app = window.app;
		const editor = app.workspace.activeEditor.editor;
		return {
			line: JSON.stringify(editor.getValue().split("\n").find((l) => l.startsWith("genre"))),
			parsed: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.genre,
		};
	}));
	// The same, on a list item typed without its space.
	note("a list item with no space", await page.evaluate(async () => {
		const app = window.app;
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath("Dune.md"), (fm) => { fm.themes = ["Religion"]; });
		await new Promise((r) => setTimeout(r, 2000));
		const editor = app.workspace.activeEditor.editor;
		const at = editor.getValue().split("\n").findIndex((l) => l.startsWith("themes:"));
		editor.setCursor({ line: at + 1, ch: editor.getLine(at + 1).length });
		editor.focus();
		return editor.getLine(at + 1);
	}));
	await page.keyboard.press("Enter");
	await sleep(400);
	// Obsidian gives "  - "; delete the space it added, to type "-Eco" as the reader might.
	await page.keyboard.press("Backspace");
	await page.keyboard.type("Eco", { delay: 90 });
	await sleep(1300);
	note("offered on the dashed item", await page.evaluate(() => ({
		line: JSON.stringify(window.app.workspace.activeEditor.editor.getLine(window.app.workspace.activeEditor.editor.getCursor().line)),
		items: Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim()),
	})));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("themes after", await page.evaluate(() => {
		const app = window.app;
		const lines = app.workspace.activeEditor.editor.getValue().split("\n");
		const at = lines.findIndex((l) => l.startsWith("themes:"));
		return {
			lines: lines.slice(at, at + 3).map((l) => JSON.stringify(l)),
			parsed: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.themes,
		};
	}));
}
