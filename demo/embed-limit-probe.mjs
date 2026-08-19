/*
 * Does an **embedded** `fileclass-table` cap its rows, and what does it cost?
 *
 *   node demo/probe.mjs 901 demo/embed-limit-probe.mjs
 *
 * Three questions, one fixture of 300 notes: how many rows an embedded fileclass-table draws
 * against the native table beside it (virtualization), whether the view's own `limit:` reaches
 * the embed, and how long a render of everything takes.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	note(
		"fixture",
		await page.evaluate(async () => {
			const app = window.app;
			app.changeTheme?.("obsidian");
			app.customCss?.setTheme?.("Minimal");
			if (!app.vault.getAbstractFileByPath("Bulk")) await app.vault.createFolder("Bulk");
			const existing = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Bulk/")).length;
			for (let i = existing; i < 300; i++)
				await app.vault.create(
					`Bulk/Note ${String(i).padStart(3, "0")}.md`,
					`---\nfileClass: Book\ngenre: Science fiction\npages: ${100 + i}\n---\n`
				);
			await new Promise((r) => setTimeout(r, 4000));

			const base = app.vault.getAbstractFileByPath("Books.base");
			const yaml = await app.vault.read(base);
			const view = (type, name, extra = "") =>
				`  - type: ${type}\n    name: ${name}\n    filters:\n      and:\n        - file.inFolder("Bulk")\n${extra}    order:\n      - file.name\n      - genre\n      - pages\n`;
			if (!yaml.includes("name: Bulk ours"))
				await app.vault.modify(
					base,
					yaml +
						view("fileclass-table", "Bulk ours") +
						view("table", "Bulk native") +
						view("fileclass-table", "Bulk capped", "    limit: 10\n")
				);
			await new Promise((r) => setTimeout(r, 2000));

			const host = "Embeds.md";
			const body = `![[Books.base#Bulk ours]]\n\n![[Books.base#Bulk native]]\n\n![[Books.base#Bulk capped]]\n`;
			const file = app.vault.getAbstractFileByPath(host);
			if (file) await app.vault.modify(file, body);
			else await app.vault.create(host, body);
			await new Promise((r) => setTimeout(r, 1500));
			return { notes: app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Bulk/")).length };
		})
	);

	// Open the host note and let every embed render. `VALIDATION=off` to attribute the cost:
	// three 300-row embeds on one page froze the renderer past the CDP timeout, and the
	// validation columns validate every field of every row and re-walk the table on each answer.
	await page.evaluate((off) => {
		if (off) window.app.plugins.plugins.fileclass.settings.enableValidationColumns = false;
	}, process.env.VALIDATION === "off");
	const t0 = Date.now();
	await page.evaluate(async () => {
		const app = window.app;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Embeds.md"));
	});
	await sleep(12000);
	note("open + render (ms, includes a fixed wait)", Date.now() - t0);

	note(
		"embeds",
		await page.evaluate(() => {
			const embeds = Array.from(document.querySelectorAll(".internal-embed"));
			return embeds.map((el) => {
				const ours = el.querySelector(".fileclass-table");
				const native = el.querySelector(".bases-tbody, .bases-table");
				const box = el.getBoundingClientRect();
				return {
					src: el.getAttribute("src"),
					kind: ours ? "fileclass-table" : native ? "native" : "(neither)",
					rowsInDom: ours
						? ours.querySelectorAll("tbody tr").length
						: el.querySelectorAll(".bases-tr").length,
					resultCount: el.querySelector(".bases-toolbar")?.textContent?.match(/[\d.,\u202f\u00a0 ]*\d results?/)?.[0]?.trim() ?? null,
					height: Math.round(box.height),
					scrolls: (() => {
						const scroller = el.querySelector(".bases-view, .bases-table-container") ?? el;
						return scroller.scrollHeight > scroller.clientHeight + 1;
					})(),
				};
			});
		})
	);

	// What it costs. Timed from the view switch to the last row being in the DOM, ours against
	// the native table's, at two sizes — the question behind "is there a limit" is really where
	// rendering everything stops being free.
	const timeView = async (viewName, expect) =>
		page.evaluate(
			async ([view, want]) => {
				const app = window.app;
				const leaf = app.workspace.getLeaf(false);
				await leaf.openFile(app.vault.getAbstractFileByPath("Books.base"));
				const t0 = performance.now();
				await leaf.setViewState({ type: "bases", state: { file: "Books.base", viewName: view } });
				const count = () => {
					const ours = document.querySelector(".fileclass-table");
					return ours
						? ours.querySelectorAll("tbody tr").length
						: document.querySelectorAll(".bases-tr").length;
				};
				// The native table never holds them all — settle for what it does draw.
				const target = view.includes("native") ? 1 : want;
				for (let i = 0; i < 600; i++) {
					if (count() >= target) break;
					await new Promise((r) => setTimeout(r, 50));
				}
				await new Promise((r) => requestAnimationFrame(() => r()));
				return { ms: Math.round(performance.now() - t0), rowsInDom: count() };
			},
			[viewName, expect]
		);

	for (const size of [300, 1500]) {
		// In batches: writing 1200 notes inside one `evaluate` outran the CDP protocol timeout,
		// and the run died with the measurement half taken.
		while (size > (await page.evaluate(() => window.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Bulk/")).length))) {
			await page.evaluate(async (target) => {
				const app = window.app;
				const have = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Bulk/")).length;
				for (let i = have; i < Math.min(have + 150, target); i++)
					await app.vault.create(
						`Bulk/Note ${String(i).padStart(4, "0")}.md`,
						`---\nfileClass: Book\ngenre: Science fiction\npages: ${100 + i}\n---\n`
					);
			}, size);
		}
		await sleep(6000);
		note(`${size} rows — ours`, await timeView("Bulk ours", size));
		note(`${size} rows — native`, await timeView("Bulk native", size));
	}

	// And in a leaf, where the native table virtualizes over a viewport of its own.
	note(
		"in a leaf",
		await page.evaluate(async () => {
			const app = window.app;
			const out = {};
			for (const viewName of ["Bulk ours", "Bulk native", "Bulk capped"]) {
				const leaf = app.workspace.getLeaf(false);
				await leaf.openFile(app.vault.getAbstractFileByPath("Books.base"));
				await leaf.setViewState({ type: "bases", state: { file: "Books.base", viewName } });
				await new Promise((r) => setTimeout(r, 5000));
				const ours = document.querySelector(".fileclass-table");
				out[viewName] = {
					rowsInDom: ours
						? ours.querySelectorAll("tbody tr").length
						: document.querySelectorAll(".bases-tr").length,
					toolbar: document.querySelector(".bases-toolbar")?.textContent?.match(/[\d.,\u202f\u00a0 ]*\d results?/)?.[0]?.trim() ?? null,
				};
			}
			return out;
		})
	);
}
