/*
 * The schema, in the editor: the value suggester and "Manage the field at the cursor" (#185).
 *
 *   node demo/probe.mjs 901 demo/frontmatter-schema-probe.mjs
 *
 * Instrument notes, each paid for here: a suggester opens on a real keystroke and not on
 * `replaceSelection`, so this types through the keyboard; `genre:` without a trailing space is not
 * a key in YAML at all, and a probe that trimmed it measured a value that never existed; and a step
 * that fails must read the notices, not only the modals, or "nothing happened" hides its reason.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	const openSource = () => page.evaluate(async () => {
		const app = window.app;
		app.changeTheme?.("obsidian"); app.customCss?.setTheme?.("Minimal");
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Dune.md"));
		await leaf.setViewState({ type: "markdown", state: { file: "Dune.md", mode: "source", source: true } });
		await new Promise((r) => setTimeout(r, 2500));
		return app.workspace.activeEditor?.editor?.getValue().split("\n").slice(0, 16);
	});
	const place = (predicate, tail = "") => page.evaluate(async ([p, t]) => {
		const editor = window.app.workspace.activeEditor.editor;
		const lines = editor.getValue().split("\n");
		const at = lines.findIndex((l) => l.startsWith(p));
		if (at < 0) return { at: -1, lines: lines.slice(0, 20) };
		if (t !== null) editor.setLine(at, `${p} ${t}`); // no trimEnd: "genre:" without a space is not a key
		editor.setCursor({ line: at, ch: editor.getLine(at).length });
		editor.focus();
		return { at, line: editor.getLine(at) };
	}, [predicate, tail]);

	note("source mode", (await openSource()).slice(0, 6));

	// 1. The suggester, on a Select field, with real keystrokes.
	note("place on genre", await place("genre:", ""));
	await page.keyboard.type("Sci", { delay: 90 });
	await sleep(1200);
	note("suggester", await page.evaluate(() => ({
		items: Array.from(document.querySelectorAll(".suggestion-item")).map((e) => e.textContent.trim()),
	})));
	await page.keyboard.press("Enter");
	await sleep(2500);
	note("after choosing", await page.evaluate(() => {
		const app = window.app;
		const fm = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter;
		const editor = app.workspace.activeEditor.editor;
		return { stored: fm?.genre, line: editor.getValue().split("\n").find((l) => l.startsWith("genre:")) };
	}));

	// 2. Nothing on a free-text field.
	note("place on publisher", await place("publisher:", ""));
	await page.keyboard.type("Chi", { delay: 90 });
	await sleep(1000);
	note("free text offers nothing", await page.evaluate(() => document.querySelectorAll(".suggestion-item").length));
	await page.keyboard.press("Escape");

	// 3. The command, on a Date field (no list to suggest).
	note("place on published", await place("published:", null));
	note("command on a Date", await page.evaluate(async () => {
		const before = document.querySelectorAll(".notice").length;
		const ran = window.app.commands.executeCommandById("fileclass:manage-field-at-cursor");
		await new Promise((r) => setTimeout(r, 1800));
		const out = {
			ran,
			modal: document.querySelector(".modal")?.textContent?.slice(0, 40) ?? null,
			notices: Array.from(document.querySelectorAll(".notice")).slice(before).map((n) => n.textContent),
			cursor: window.app.workspace.activeEditor?.editor?.getCursor(),
			line: window.app.workspace.activeEditor?.editor?.getLine(window.app.workspace.activeEditor.editor.getCursor().line),
		};
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		return out;
	}));

	// 4. The command on a child of an ObjectList: the right item's editor.
	note("place on the second edition's year", await page.evaluate(async () => {
		const editor = window.app.workspace.activeEditor.editor;
		const lines = editor.getValue().split("\n");
		const years = lines.map((l, i) => [l, i]).filter(([l]) => l.trim().startsWith("year:"));
		const [line, at] = years[1] ?? years[0];
		editor.setCursor({ line: at, ch: line.length });
		editor.focus();
		return { at, line };
	}));
	note("command inside an item", await page.evaluate(async () => {
		window.app.commands.executeCommandById("fileclass:manage-field-at-cursor");
		await new Promise((r) => setTimeout(r, 2000));
		const modals = Array.from(document.querySelectorAll(".modal")).map((m) => m.textContent.slice(0, 50));
		const notices = Array.from(document.querySelectorAll(".notice")).map((n) => n.textContent).slice(-2);
		if (!modals.length) return { modals, notices, cursor: window.app.workspace.activeEditor.editor.getCursor() };
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await new Promise((r) => setTimeout(r, 400));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		return modals;
	}));

	// 5. A key the schema does not declare.
	note("unknown key", await page.evaluate(async () => {
		const editor = window.app.workspace.activeEditor.editor;
		editor.setCursor({ line: 1, ch: 0 });
		editor.replaceRange("madeUpKey: whatever\n", { line: 1, ch: 0 });
		editor.setCursor({ line: 1, ch: 19 });
		await new Promise((r) => setTimeout(r, 800));
		window.app.commands.executeCommandById("fileclass:manage-field-at-cursor");
		await new Promise((r) => setTimeout(r, 1200));
		return {
			modal: !!document.querySelector(".modal"),
			notice: Array.from(document.querySelectorAll(".notice")).map((n) => n.textContent).slice(-1),
		};
	}));
}
