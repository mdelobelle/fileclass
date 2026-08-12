/*
 * #84's Templater path, measured (see demo/902_templater/scenario.yaml for the fixture).
 *
 *   node demo/902_templater/install-templater.mjs
 *   node demo/probe.mjs 902 demo/templater-probe.mjs
 *
 * Three questions reasoning cannot answer:
 *  1. does Templater actually run on a note Fileclass created — its `write_template_to_file` is an
 *     internal, reached through the adapter;
 *  2. does its frontmatter merge into **one** block, with its values kept and the seed still
 *     winning on its own field;
 *  3. what happens when a template **renames the file** (`tp.file.rename()`), which is the case the
 *     code handles by looking for the newest note rather than by holding a path.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(4000);

	note("plugins", await page.evaluate(() => ({
		templater: !!window.app.plugins.plugins["templater-obsidian"],
		writeTemplateToFile: typeof window.app.plugins.plugins["templater-obsidian"]?.templater
			?.write_template_to_file,
		fileclass: !!window.app.plugins.plugins.fileclass,
	})));
	note("engine the adapter picks", await page.evaluate(() => {
		const p = window.app.plugins.plugins["templater-obsidian"];
		return p?.templater?.write_template_to_file ? "templater" : "(not templater)";
	}));

	const create = async (name) => {
		await sleep(2000);
		return page.evaluate((n) => {
			const modal = Array.from(document.querySelectorAll(".modal")).pop();
			if (!modal) return "(no name modal)";
			const input = modal.querySelector("input");
			if (input) {
				input.value = n;
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
			Array.from(modal.querySelectorAll("button"))
				.find((b) => b.textContent.trim() === "Create")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return n;
		}, name);
	};
	const read = (path) =>
		page.evaluate(async (p) => {
			const f = window.app.vault.getAbstractFileByPath(p);
			return f ? await window.app.vault.read(f) : "(missing)";
		}, path);

	// -- 1 & 2: seeded creation from the reverse table on Frank Herbert's note -------------------
	note("opened the host", await page.evaluate(async () => {
		const leaf = window.app.workspace.getLeaf(false);
		await leaf.openFile(window.app.vault.getAbstractFileByPath("Frank Herbert.md"));
		await leaf.view.setState({ ...leaf.view.getState(), mode: "preview" }, {});
		return true;
	}));
	// The embed renders, then Bases runs its query, then our view draws and adds its toolbar items:
	// three asynchronous steps, so this waits for the button rather than for a duration.
	note("the button", await page.evaluate(async () => {
		const find = () =>
			document.querySelector(".markdown-reading-view .fileclass-toolbar-new .text-icon-button");
		for (let i = 0; i < 40 && !find(); i++) await new Promise((r) => setTimeout(r, 500));
		const btn = find();
		if (!btn) {
			const labels = Array.from(
				document.querySelectorAll(".markdown-reading-view .bases-toolbar .text-button-label")
			).map((l) => l.textContent.trim());
			return `(no New button after 20s — toolbar had: ${JSON.stringify(labels)})`;
		}
		const label = btn.querySelector(".text-button-label")?.textContent.trim();
		btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		return label;
	}));
	note("named it", await create("Chapterhouse Dune"));
	await sleep(5000);
	note("the note", await read("Reading list/Chapterhouse Dune.md"));
	note("one frontmatter block", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Reading list/Chapterhouse Dune.md");
		if (!f) return "(missing)";
		const body = await window.app.vault.read(f);
		return { blocks: (body.match(/^---$/gm) ?? []).length, startsWithFrontmatter: body.startsWith("---\n") };
	}));

	// -- 3: a template that renames the file it is applied to ------------------------------------
	note("rename template written", await page.evaluate(async () => {
		const v = window.app.vault;
		const path = "Templates/Renaming book.md";
		const body =
			'---\nfileClass: Book\npublisher: Renamed Press\n---\n\n' +
			'<%* await tp.file.rename("Renamed by the template") %>\n## Notes\n';
		const existing = v.getAbstractFileByPath(path);
		if (existing) await v.modify(existing, body);
		else await v.create(path, body);
		const cls = v.getAbstractFileByPath("Classes/Book.md");
		const y = await v.read(cls);
		await v.modify(cls, y.replace(/fileClassNoteTemplate: .*/, `fileClassNoteTemplate: ${path}`));
		return path;
	}));
	await sleep(3000);
	await page.evaluate(() => window.app.commands.executeCommandById("fileclass:create-note"));
	await sleep(1500);
	await page.evaluate(() => {
		const el = Array.from(document.querySelectorAll(".suggestion-item")).find(
			(e) => e.textContent.trim() === "Book"
		);
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	note("named it", await create("Will be renamed"));
	await sleep(6000);
	note("what exists now", await page.evaluate(() =>
		window.app.vault
			.getMarkdownFiles()
			.map((f) => f.path)
			.filter((p) => /Renamed by the template|Will be renamed/.test(p))
	));
	note("the renamed note", await read("Reading list/Renamed by the template.md"));
}
