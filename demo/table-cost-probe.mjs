/*
 * What a big `fileclass-table` costs, and which part of it costs.
 *
 *   node demo/probe.mjs 901 demo/table-cost-probe.mjs
 *
 * The embed probe kept dying on the CDP timeout with three 300-row embeds on screen, which is
 * a freeze, not a limit — so this one attributes it: the render itself, the fit pass added for
 * cell overflow, and the validation columns (async per row, each answer re-walking the table).
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	const rows = Number(process.env.ROWS ?? 300);
	await page.evaluate(async () => {
		window.app.changeTheme?.("obsidian");
		window.app.customCss?.setTheme?.("Minimal");
		if (!window.app.vault.getAbstractFileByPath("Bulk")) await window.app.vault.createFolder("Bulk");
	});
	// In batches: one `evaluate` writing them all outran the protocol timeout.
	for (;;) {
		const have = await page.evaluate(
			() => window.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Bulk/")).length
		);
		if (have >= rows) break;
		await page.evaluate(async (target) => {
			const app = window.app;
			const have = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Bulk/")).length;
			for (let i = have; i < Math.min(have + 150, target); i++)
				await app.vault.create(
					`Bulk/Note ${String(i).padStart(4, "0")}.md`,
					// Eight links per row: the shape the fit pass exists for.
					`---\nfileClass: Book\ngenre: Science fiction\nauthor: "[[Frank Herbert]]"\nread by:\n${[
						"Frank Herbert",
						"Mary Shelley",
						"Isaac Asimov",
						"Ursula K. Le Guin",
						"Philip K. Dick",
						"Arthur C. Clarke",
						"Terry Pratchett",
						"Jules Verne",
					]
						.map((n) => `  - "[[${n}]]"`)
						.join("\n")}\n---\n`
				);
		}, rows);
	}
	await sleep(6000);
	note("fixture", { rows });

	note(
		"view added",
		await page.evaluate(async () => {
			const app = window.app;
			const base = app.vault.getAbstractFileByPath("Books.base");
			const yaml = await app.vault.read(base);
			if (!yaml.includes("name: Bulk ours"))
				await app.vault.modify(
					base,
					`${yaml}  - type: fileclass-table\n    name: Bulk ours\n    filters:\n      and:\n        - file.inFolder("Bulk")\n    order:\n      - file.name\n      - author\n      - read by\n      - genre\n`
				);
			await new Promise((r) => setTimeout(r, 2000));
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(base);
			await leaf.setViewState({ type: "bases", state: { file: "Books.base", viewName: "Bulk ours" } });
			await new Promise((r) => setTimeout(r, 8000));
			return document.querySelectorAll(".fileclass-table tbody tr").length;
		})
	);

	const measure = async (label, validation, indicators = true) =>
		note(
			label,
			await page.evaluate(async ([withValidation, withIndicators]) => {
				const app = window.app;
				const plugin = app.plugins.plugins.fileclass;
				plugin.settings.enableValidationColumns = withValidation;
				plugin.settings.enableBasesIndicator = withIndicators;
				plugin.linkIndicator?.refreshNow?.();
				await new Promise((r) => setTimeout(r, 1500));
				const leafView = app.workspace.getLeavesOfType("bases")[0]?.view;
				const own = (o) => (o ? Object.getOwnPropertyNames(o).filter((k) => !k.startsWith("_")) : []);
				let inner = null;
				for (const host of [leafView, leafView?.controller])
					for (const k of own(host)) {
						const v = host[k];
						if (v && typeof v === "object" && typeof v.type === "string" && "data" in v) inner = v;
					}
				if (!inner) return "(view not found)";

				// Time the fit pass from the inside; it is scheduled, not called by the render.
				const fits = [];
				if (!inner.__timed) {
					const original = inner.fitCells.bind(inner);
					inner.fitCells = function timed() {
						const t = performance.now();
						original();
						fits.push(performance.now() - t);
					};
					inner.__timed = true;
					inner.__fits = fits;
				}
				inner.__fits.length = 0;

				const t0 = performance.now();
				inner.onDataUpdated();
				const renderMs = performance.now() - t0;
				await new Promise((r) => setTimeout(r, 3000));
				const out = {
					rows: document.querySelectorAll(".fileclass-table tbody tr").length,
					renderMs: Math.round(renderMs),
					fitPasses: inner.__fits.map((ms) => Math.round(ms)),
					fittedCells: document.querySelectorAll(".fc-cell.fc-fit").length,
					icons: document.querySelectorAll(".fileclass-table .fileclass-indicator").length,
				};
				return out;
			}, [validation, indicators])
		);

	await measure("validation on, indicators on", true, true);
	await measure("validation off, indicators on", false, true);
	// No icons to wait for: the second pass has nothing to correct and should not run.
	await measure("validation off, indicators off", false, false);
}
