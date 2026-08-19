/*
 * A `MultiFile` cell with a dozen links: does it stay inside its column?
 *
 *   node demo/probe.mjs 901 demo/multi-cell-overflow-probe.mjs
 *
 * Reported on a production vault: a `with` column holding twelve people spilled over the
 * columns to its right instead of truncating like a two-link cell does. Reproduced here by
 * giving Book a `read by` field and filling it with the vault's authors, then measuring each
 * cell's own box against what it draws — `scrollWidth > clientWidth` is the overflow, and the
 * cell's right edge against the next column's left edge is what the eye sees.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	const D = (process.env.CLAUDE_JOB_DIR ?? "/tmp") + "/tmp/";
	await sleep(3000);

	note(
		"setup",
		await page.evaluate(async () => {
			const app = window.app;
			app.changeTheme?.("obsidian");
			app.customCss?.setTheme?.("Minimal");
			const book = app.vault.getAbstractFileByPath("Classes/Book.md");
			await app.fileManager.processFrontMatter(book, (fm) => {
				const fields = fm.fields ?? [];
				if (!fields.some((f) => f.name === "read by"))
					fields.push({ name: "read by", id: "rDby01", type: "MultiFile", options: {}, path: "" });
				fm.fields = fields;
			});
			await new Promise((r) => setTimeout(r, 2500));

			// The authors of this vault, as a long list of links — the shape that overflowed.
			const authors = app.vault
				.getMarkdownFiles()
				.filter((f) => app.metadataCache.getFileCache(f)?.frontmatter?.fileClass === "Author")
				.map((f) => `[[${f.basename}]]`);
			const books = app.vault
				.getMarkdownFiles()
				.filter((f) => app.metadataCache.getFileCache(f)?.frontmatter?.fileClass === "Book");
			// Every book gets a list, cycling: everything, two (the case that already read well),
			// none, five. The first run filled four notes and measured four *other* rows — the
			// view sorts, and none of the four it showed had been touched.
			const counts = [authors.length, 2, 0, 5];
			for (const [i, file] of books.entries())
				await app.fileManager.processFrontMatter(file, (fm) => {
					fm["read by"] = authors.slice(0, counts[i % counts.length]);
				});
			await new Promise((r) => setTimeout(r, 2000));

			// Show the column in the fileclass-table view.
			const base = app.vault.getAbstractFileByPath("Books.base");
			const yaml = await app.vault.read(base);
			if (!yaml.includes("- read by"))
				await app.vault.modify(base, yaml.replace(/(\n      - lent to)/, "$1\n      - read by"));
			return {
				authors: authors.length,
				books: books.map((f) => f.basename).slice(0, 4),
			};
		})
	);
	await sleep(2000);

	await page.evaluate(async () => {
		const app = window.app;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Books.base"));
		await leaf.setViewState({ type: "bases", state: { file: "Books.base", viewName: "Book" } });
	});
	// The link indicators arrive on their own debounce; wait past it.
	await sleep(6000);

	note(
		"cells",
		await page.evaluate(() => {
			const table = document.querySelector(".fileclass-table");
			if (!table) return "(no fileclass-table)";
			const head = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
			const col = head.indexOf("read by");
			const rows = Array.from(table.querySelectorAll("tbody tr:not(.fileclass-table-group)"));
			return {
				head,
				column: col,
				rows: rows.slice(0, 6).map((tr) => {
					const td = tr.children[col];
					const content = td?.querySelector(".fc-cell");
					const next = tr.children[col + 1];
					// The div's own box is clamped by its max-width; what spills is its children,
					// so the drawn right edge is the rightmost child's.
					const drawnRight = content
						? Math.max(
								content.getBoundingClientRect().right,
								...Array.from(content.children).map((c) => c.getBoundingClientRect().right)
							)
						: null;
					const nextBox = next?.getBoundingClientRect();
					return {
						name: tr.children[head.indexOf("Name")]?.textContent.trim().slice(0, 22),
						links: td?.querySelectorAll("a.internal-link").length ?? 0,
						icons: td?.querySelectorAll(".fileclass-indicator").length ?? 0,
						clientWidth: content ? Math.round(content.clientWidth) : null,
						scrollWidth: content ? Math.round(content.scrollWidth) : null,
						// What the eye sees: content drawn past where the next column starts.
						spillsIntoNextColumn:
							drawnRight && nextBox ? Math.round(drawnRight - nextBox.left) : null,
						more: td?.querySelector(".fc-more")?.textContent ?? null,
					};
				}),
			};
		})
	);

	// A two-column view, where the pane — not the twenty other columns — sets the width. The
	// wide view above never changes size, whatever the pane does, so it can say nothing about
	// what happens when a column narrows.
	const readCell = () => {
		const table = document.querySelector(".fileclass-table");
		const head = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
		const col = head.indexOf("read by");
		const row = Array.from(table.querySelectorAll("tbody tr")).find((tr) =>
			tr.children[head.indexOf("Name")]?.textContent.includes("Dune")
		);
		const cell = row?.children[col]?.querySelector(".fc-cell");
		return {
			width: cell ? Math.round(cell.clientWidth) : null,
			shown: cell
				? Array.from(cell.querySelectorAll(".fc-item")).filter((i) => !i.classList.contains("fc-hidden")).length
				: null,
			more: cell?.querySelector(".fc-more")?.textContent ?? null,
			overflows: cell ? cell.scrollWidth > cell.clientWidth + 1 : null,
		};
	};

	note(
		"a wide column",
		await page.evaluate(async (readCellSrc) => {
			const app = window.app;
			const base = app.vault.getAbstractFileByPath("Books.base");
			const yaml = await app.vault.read(base);
			if (!yaml.includes("name: Wide"))
				await app.vault.modify(
					base,
					`${yaml}  - type: fileclass-table
    name: Wide
    filters:
      and:
        - fileClass.containsAny("Book")
    order:
      - file.name
      - read by
`
				);
			await new Promise((r) => setTimeout(r, 1500));
			const leaf = app.workspace.getLeavesOfType("bases")[0];
			await leaf.setViewState({ type: "bases", state: { file: "Books.base", viewName: "Wide" } });
			await new Promise((r) => setTimeout(r, 5000));
			return eval(`(${readCellSrc})`)();
		}, readCell.toString())
	);

	// A narrower cell, without a re-render — the `onResize` path.
	//
	// Neither splitting the pane nor a narrow viewport moved this column: a cell is capped at
	// 20em and, at this table's font size, that 260px is what it always got. So the width is
	// narrowed directly and the view told to resize, which is the same door Obsidian knocks on.
	note(
		"a 9em cell, after onResize",
		await page.evaluate(async (readCellSrc) => {
			const style = document.createElement("style");
			style.id = "fc-probe-narrow";
			style.textContent = ".fileclass-table .fc-cell { max-width: 9em; }";
			document.head.appendChild(style);
			const leafView = window.app.workspace.getLeavesOfType("bases")[0]?.view;
			const own = (o) => (o ? Object.getOwnPropertyNames(o).filter((k) => !k.startsWith("_")) : []);
			let inner = null;
			for (const host of [leafView, leafView?.controller])
				for (const k of own(host)) {
					const v = host[k];
					if (v && typeof v === "object" && typeof v.type === "string" && "data" in v) inner = v;
				}
			inner?.onResize?.();
			await new Promise((r) => setTimeout(r, 1200));
			return { view: inner?.type ?? null, ...eval(`(${readCellSrc})`)() };
		}, readCell.toString())
	);

	// The cell still edits: a click anywhere but on a link opens the field's editor.
	note(
		"click to edit",
		await page.evaluate(async () => {
			const table = document.querySelector(".fileclass-table");
			const head = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
			const row = Array.from(table.querySelectorAll("tbody tr")).find((tr) =>
				tr.children[head.indexOf("Name")]?.textContent.includes("Dune")
			);
			const td = row?.children[head.indexOf("read by")];
			td?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 1500));
			const modal = document.querySelector(".modal-container");
			const opened = !!modal;
			const title = modal?.querySelector(".modal-title, .setting-item-name")?.textContent ?? null;
			modal?.querySelector(".modal-close-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return { opened, title, tooltip: (td?.getAttribute("title") ?? "").slice(0, 40) };
		})
	);

	await page.screenshot({ path: D + "multi-cell-overflow.png" });
	console.log(`· shot: ${D}multi-cell-overflow.png`);
}
