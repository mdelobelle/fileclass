/*
 * What the suggester offers when what was typed matches nothing (#185).
 *
 *   node demo/probe.mjs 901 demo/frontmatter-fallback-probe.mjs
 *
 * Reported from a real vault: typing after a value that is already there makes the query the whole
 * text — `Science fictionFa` — which matches no candidate, so the popover never appeared and the
 * feature read as broken. It now falls back to the field's values, and since a choice replaces the
 * whole value, picking one repairs the line.
 *
 * Instrument note: the narrowing check needs a value this vault actually allows. "Goth" is not one
 * (it is the very value Frankenstein is flagged for), so querying it measured the fallback again
 * rather than the filter.
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
	// The reported gesture: type after a value that is already there.
	note("an existing value", await page.evaluate(() => {
		const editor = window.app.workspace.activeEditor.editor;
		const at = editor.getValue().split("\n").findIndex((l) => l.startsWith("genre:"));
		editor.setLine(at, "genre: Science fiction");
		editor.setCursor({ line: at, ch: "genre: Science fiction".length });
		editor.focus();
		return editor.getLine(at);
	}));
	await page.keyboard.type("Fa", { delay: 90 });
	await sleep(1300);
	note("offered when nothing matches", await page.evaluate(() => ({
		line: JSON.stringify(window.app.workspace.activeEditor.editor.getLine(window.app.workspace.activeEditor.editor.getCursor().line)),
		items: Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim()),
	})));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("choosing repairs the line", await page.evaluate(() => {
		const app = window.app;
		return {
			line: JSON.stringify(app.workspace.activeEditor.editor.getValue().split("\n").find((l) => l.startsWith("genre"))),
			parsed: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.genre,
		};
	}));
	// And a query that does match still narrows.
	note("a query that does match", await page.evaluate(async () => {
		const editor = window.app.workspace.activeEditor.editor;
		const at = editor.getValue().split("\n").findIndex((l) => l.startsWith("genre:"));
		editor.setLine(at, "genre: ");
		editor.setCursor({ line: at, ch: 7 });
		editor.focus();
		return editor.getLine(at);
	}));
	await page.keyboard.type("Fan", { delay: 90 }); // a value that exists — "Goth" is not allowed here
	await sleep(1300);
	note("offered", await page.evaluate(() => Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim())));
}
