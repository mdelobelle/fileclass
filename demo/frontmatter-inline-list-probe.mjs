/*
 * A list written inline, and what a chosen value does to it (#185).
 *
 *   node demo/probe.mjs 901 demo/frontmatter-inline-list-probe.mjs
 *
 * `themes: []` is the shape Obsidian writes for an empty list. Choosing a value there produces the
 * block list every other surface writes — the `[]` goes, the value arrives on its own line.
 *
 * Instrument note: resetting the line means replacing the key **and its block items**. Replacing
 * only the key leaves orphan `- item` lines under an inline value, which is not YAML — and then the
 * note has no class, no fields, and every measurement after it is about nothing.
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
	/** Puts the line back to a known state and waits for the cache to agree. */
	const reset = (text, ch) => page.evaluate(async ([t, c]) => {
		const app = window.app;
		const editor = app.workspace.activeEditor.editor;
		const lines = editor.getValue().split("\n");
		const at = lines.findIndex((l) => l.startsWith("themes"));
		// The key **and its block items**: replacing only the key line leaves orphan `- item` lines
		// under an inline value, which is not YAML at all — and then the note has no class, no
		// fields, and every measurement after it is about nothing.
		let last = at;
		while (/^\s+-/.test(lines[last + 1] ?? "")) last++;
		editor.replaceRange(t, { line: at, ch: 0 }, { line: last, ch: lines[last].length });
		editor.setCursor({ line: at, ch: c });
		editor.focus();
		// Let the buffer save and the cache reparse, so what follows starts from a valid note.
		await new Promise((r) => setTimeout(r, 2500));
		return {
			line: editor.getLine(at),
			cached: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.themes,
		};
	}, [text, ch]);
	const read = () => page.evaluate(() => {
		const app = window.app;
		const editor = app.workspace.activeEditor.editor;
		return {
			line: editor.getValue().split("\n").find((l) => l.startsWith("themes")),
			cached: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.themes,
		};
	});

	note("empty inline list", await reset("themes: []", 9));
	await page.keyboard.type("Rel", { delay: 90 });
	await sleep(1200);
	note("offered", await page.evaluate(() => Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim())));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("after choosing into []", await read());

	note("one value already there", await reset("themes: [Religion, ]", 19));
	await page.keyboard.type("Eco", { delay: 90 });
	await sleep(1200);
	note("offered", await page.evaluate(() => Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim())));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("after a second value", await read());

	note("the command on an empty inline list", await page.evaluate(async () => {
		const app = window.app;
		const editor = app.workspace.activeEditor.editor;
		const lines = editor.getValue().split("\n");
		const at = lines.findIndex((l) => l.startsWith("themes"));
		// The key and its block items: leaving orphan `- item` lines under an inline value is not
		// YAML, and then the note has no class and the measurement is about nothing.
		let last = at;
		while (/^\s+-/.test(lines[last + 1] ?? "")) last++;
		editor.replaceRange("themes: []", { line: at, ch: 0 }, { line: last, ch: lines[last].length });
		editor.setCursor({ line: at, ch: 10 });
		editor.focus();
		await new Promise((r) => setTimeout(r, 2500));
		const before = document.querySelectorAll(".notice").length;
		app.commands.executeCommandById("fileclass:manage-field-at-cursor");
		await new Promise((r) => setTimeout(r, 1800));
		return {
			modal: document.querySelector(".modal")?.textContent?.slice(0, 30) ?? "(no modal)",
			notices: Array.from(document.querySelectorAll(".notice")).slice(before).map((n) => n.textContent),
		};
	}));
}
