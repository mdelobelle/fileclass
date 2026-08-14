/*
 * Does Bases group a table, and does the grouping reach a **plugin** view?
 *
 *   node demo/probe.mjs 901 demo/groupby-probe.mjs
 *
 * Read from the app bundle first: `groupBy` is an object `{property, direction}` (not a list —
 * the first run of this probe wrote a list and got 0 results in both views, its own premise gone),
 * and the dataset carries a `groupedData` getter that applies it. Both are checked here on a live
 * instance: the native table, then ours, over the same rows.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	note(
		"views added",
		await page.evaluate(async () => {
			const file = window.app.vault.getAbstractFileByPath("Books.base");
			const yaml = await window.app.vault.read(file);
			const block = (type, name) =>
				`  - type: ${type}\n    name: ${name}\n    filters:\n      and:\n        - fileClass.containsAny("Book")\n` +
				`    groupBy:\n      property: note.genre\n      direction: ASC\n` +
				`    order:\n      - file.name\n      - genre\n`;
			await window.app.vault.modify(file, `${yaml}${block("table", "grp native")}${block("fileclass-table", "grp ours")}`);
			return (await window.app.vault.read(file)).includes("grp ours");
		})
	);
	await sleep(1500);

	const open = async (viewName) => {
		await page.evaluate(async (view) => {
			const leaf = window.app.workspace.getLeaf(false);
			await leaf.openFile(window.app.vault.getAbstractFileByPath("Books.base"));
			await leaf.setViewState({ type: "bases", state: { file: "Books.base", viewName: view } });
		}, viewName);
		await sleep(4500);
	};

	const inspect = () =>
		page.evaluate(() => {
			const leafView = window.app.workspace.getLeavesOfType("bases")[0]?.view;
			// The plugin/native view sits under the leaf view; find it by its `type` field.
			const own = (o) => (o ? Object.getOwnPropertyNames(o).filter((k) => !k.startsWith("_")) : []);
			let inner = null;
			for (const k of own(leafView)) {
				const v = leafView[k];
				if (v && typeof v === "object" && typeof v.type === "string" && "data" in v) inner = v;
			}
			const ctrl = leafView?.controller;
			if (!inner && ctrl)
				for (const k of own(ctrl)) {
					const v = ctrl[k];
					if (v && typeof v === "object" && typeof v.type === "string" && "data" in v) inner = v;
				}
			const dataObj = inner?.data ?? null;
			let grouped = null;
			try {
				const g = dataObj?.groupedData;
				grouped = Array.isArray(g)
					? g.map((x) => ({
							key: x.key ? String(x.key) : null,
							hasKey: typeof x.hasKey === "function" ? x.hasKey() : null,
							entries: x.entries?.length ?? null,
						}))
					: `not an array: ${typeof g}`;
			} catch (e) {
				grouped = `threw: ${e.message}`;
			}
			return {
				viewType: inner?.type ?? "(inner view not found)",
				rowsInDom: document.querySelectorAll(".bases-tr, tbody tr").length,
				groupHeadingsInDom: Array.from(document.querySelectorAll(".bases-group-heading")).map((e) =>
					e.textContent.trim().slice(0, 40)
				),
				entries: dataObj?.data?.length ?? null,
				groupedData: grouped,
				configGroupBy: (() => {
					try {
						const gb = inner?.config?.groupBy ?? inner?.config?.get?.("groupBy") ?? null;
						return gb ? { property: String(gb.property ?? ""), direction: gb.direction ?? null } : null;
					} catch (e) {
						return `threw: ${e.message}`;
					}
				})(),
			};
		});

	await open("grp native");
	note("native table", await inspect());

	await open("grp ours");
	note("fileclass-table", await inspect());

	// What ours draws, now that it reads the groups: one heading per group, rows unchanged.
	note(
		"ours, rendered",
		await page.evaluate(() => ({
			headings: Array.from(document.querySelectorAll(".fileclass-table tr.fileclass-table-group")).map((e) =>
				e.textContent.trim()
			),
			rows: document.querySelectorAll(".fileclass-table tbody tr:not(.fileclass-table-group)").length,
			editableCells: document.querySelectorAll(".fileclass-table td.fileclass-editable").length,
			headingSpan: document.querySelector(".fileclass-table tr.fileclass-table-group td")?.getAttribute("colspan"),
		}))
	);
}
