/*
 * Does a table apply an Object's `displayTemplate`? And is `Object` in the same shape as
 * `ObjectList`, or only the latter?
 *
 *   node demo/probe.mjs 901 demo/object-display-probe.mjs
 *
 * Compares, over the same two properties (`Comic.storage`, an Object with a nested Object, and
 * `Book.editions`, an ObjectList): the native Bases `table`, our `fileclass-table`, and the
 * plugin's own note-fields modal — which is the surface that does apply the template.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	/** Adds a pair of views (native / ours) over one property, so the two are read side by side. */
	const addViews = (basePath, className, property) =>
		page.evaluate(
			async ([path, cls, prop]) => {
				const file = window.app.vault.getAbstractFileByPath(path);
				const yaml = await window.app.vault.read(file);
				const block = (type, name) =>
					`  - type: ${type}\n    name: ${name}\n    filters:\n      and:\n        - fileClass.containsAny("${cls}")\n    order:\n      - file.name\n      - ${prop}\n`;
				await window.app.vault.modify(
					file,
					`${yaml}${block("table", "probe native")}${block("fileclass-table", "probe ours")}`
				);
				return (await window.app.vault.read(file)).includes("probe ours");
			},
			[basePath, className, property]
		);

	/** Opens a view and returns the row texts, cell by cell. */
	const rows = async (basePath, viewName, wantedNote) => {
		await page.evaluate(
			async ([path, view]) => {
				const leaf = window.app.workspace.getLeaf(false);
				await leaf.openFile(window.app.vault.getAbstractFileByPath(path));
				await leaf.setViewState({ type: "bases", state: { file: path, viewName: view } });
			},
			[basePath, viewName]
		);
		await sleep(4500);
		return page.evaluate((name) => {
			const rowsEl = Array.from(document.querySelectorAll(".bases-tr, tbody tr"));
			const hit = rowsEl.find((r) => r.textContent.includes(name));
			if (!hit) return `(no row for ${name} — rows: ${rowsEl.length})`;
			return Array.from(hit.querySelectorAll(".bases-td, td")).map((c) => c.textContent.trim());
		}, wantedNote);
	};

	// -- Object: Comic.storage, {{room}} · {{shelf}} with a nested Object child ------------------
	note("views added to Comics.base", await addViews("Comics.base", "Comic", "storage"));
	await sleep(1500);
	note("Object · native table", await rows("Comics.base", "probe native", "The Yellow M"));
	note("Object · fileclass-table", await rows("Comics.base", "probe ours", "The Yellow M"));

	// -- ObjectList: Book.editions, {{format}} · {{year}} ---------------------------------------
	note("views added to Books.base", await addViews("Books.base", "Book", "editions"));
	await sleep(1500);
	note("ObjectList · native table", await rows("Books.base", "probe native", "Dune"));
	note("ObjectList · fileclass-table", await rows("Books.base", "probe ours", "Dune"));

	// Cells are truncated with an ellipsis and carry the full value as a tooltip: it must be the
	// rendered text too, or hovering would hand back the JSON the cell was fixed not to show.
	note("hover title on the group cell", await page.evaluate(() => {
		const hit = Array.from(document.querySelectorAll(".bases-tr, tbody tr")).find((r) =>
			r.textContent.includes("Dune")
		);
		return Array.from(hit?.querySelectorAll("td") ?? [])
			.map((c) => c.getAttribute("title"))
			.filter(Boolean);
	}));

	// -- the plugin's own surface, which does apply the template ---------------------------------
	note("note fields modal", await page.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath("The Yellow M.md");
		await window.app.workspace.getLeaf(false).openFile(file);
		window.app.commands.executeCommandById("fileclass:manage-note-fields");
		await new Promise((r) => setTimeout(r, 2500));
		const rows = Array.from(document.querySelectorAll(".modal .setting-item"));
		const hit = rows.find((r) => r.textContent.includes("storage"));
		return hit ? hit.textContent.trim().slice(0, 160) : `(no storage row — ${rows.length} rows)`;
	}));
}
