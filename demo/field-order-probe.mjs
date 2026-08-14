/*
 * Does a class's own field order hold, across every surface, and stay its own?
 *
 *   node demo/probe.mjs 901 demo/field-order-probe.mjs
 *
 * The 901 vault has `Book extends Media` and `Comic extends Media`, which is exactly the shape the
 * question is about: what Book does to Media's fields must not reach Media, nor Comic.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	const resolved = (cls) =>
		page.evaluate((name) => {
			const api = window.app.plugins.plugins.fileclass;
			return api.index.getResolvedFields(name).filter((f) => !f.path).map((f) => `${f.name}(${f.fileClassName})`);
		}, cls);

	note("Book, by default", await resolved("Book"));
	note("Comic, by default", await resolved("Comic"));

	// The default the chain gives: Media's fields, then the class's own.
	note(
		"Book — order declared: author first, then Media's",
		await page.evaluate(async () => {
			const app = window.app;
			const file = app.vault.getAbstractFileByPath("Classes/Book.md");
			const api = app.plugins.plugins.fileclass;
			const own = api.index
				.getResolvedFields("Book")
				.filter((f) => !f.path)
				.map((f) => f.name);
			// author (Book's) moved to the head, then Media's in their own order.
			const reordered = ["author", ...own.filter((n) => n !== "author")];
			await app.fileManager.processFrontMatter(file, (fm) => {
				fm.fieldsOrder = reordered;
			});
			await new Promise((r) => setTimeout(r, 2500));
			return api.index.getResolvedFields("Book").filter((f) => !f.path).map((f) => f.name);
		})
	);

	note("Comic, untouched", await resolved("Comic"));
	note(
		"Media, untouched",
		await page.evaluate(() => {
			const api = window.app.plugins.plugins.fileclass;
			return api.index.getResolvedFields("Media").filter((f) => !f.path).map((f) => f.name);
		})
	);

	// The note-fields modal reads the same resolved set.
	note(
		"note fields modal, on a Book",
		await page.evaluate(async () => {
			const app = window.app;
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(app.vault.getAbstractFileByPath("Dune.md"));
			await new Promise((r) => setTimeout(r, 1500));
			app.commands.executeCommandById("fileclass:manage-note-fields");
			await new Promise((r) => setTimeout(r, 2000));
			const names = Array.from(document.querySelectorAll(".modal .fileclass-field-row .setting-item-name")).map(
				(e) => e.textContent.trim()
			);
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			return names.slice(0, 6);
		})
	);

	// And the schema editor. Opened from the class note's own `fields` row rather than through the
	// class picker: two earlier runs of this probe typed a name into that picker, landed on **Book**,
	// and measured the wrong class for three checks in a row.
	note(
		"schema editor rows",
		await page.evaluate(async () => {
			const app = window.app;
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(app.vault.getAbstractFileByPath("Classes/Book.md"));
			await new Promise((r) => setTimeout(r, 2500));
			document.querySelector(".fileclass-fields-summary")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 2000));
			return Array.from(document.querySelectorAll(".fileclass-field-list > .setting-item"))
				.slice(0, 5)
				.map((row) => ({
					name: row.querySelector(".setting-item-name")?.textContent?.trim(),
					from: row.querySelector(".fileclass-field-from")?.textContent ?? null,
					buttons: Array.from(row.querySelectorAll("button")).map((b) => b.textContent.trim()),
				}));
		})
	);

	/**
	 * Moving the second row up, twice — the case that was reported broken.
	 *
	 * The write was always right; the **list** was not. This screen reads the resolved set, which
	 * the index builds on a 400 ms debounce, so rendering on the metadata event alone drew the order
	 * as it was before the write that triggered it: the rows never moved, and the next click acted on
	 * a row that was no longer where it appeared. What this asserts is that the list and the resolved
	 * order agree after **every** click.
	 */
	const moveUp = (nth) =>
		page.evaluate(async (n) => {
			const rows = Array.from(document.querySelectorAll(".fileclass-field-list > .setting-item"));
			const clicked = rows[n]?.querySelector(".setting-item-name")?.textContent?.trim();
			rows[n]?.querySelector('[aria-label="Move up"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 2500));
			const api = window.app.plugins.plugins.fileclass;
			const rowsNow = Array.from(
				document.querySelectorAll(".fileclass-field-list > .setting-item .setting-item-name")
			).map((e) => e.textContent.trim().replace(/from \w+$/, "").trim());
			const resolved = api.index.getResolvedFields("Book").filter((f) => !f.path).map((f) => f.name);
			return {
				clicked,
				rows: rowsNow.slice(0, 4),
				agrees: rowsNow.slice(0, 6).join() === resolved.slice(0, 6).join(),
			};
		}, nth);

	note("move row #2 up", await moveUp(1));
	note("move row #2 up again", await moveUp(1));
	note("move row #3 up", await moveUp(2));
}
