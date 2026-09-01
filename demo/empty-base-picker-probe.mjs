/*
 * #199: a base-bound picker that matches nothing must say so.
 *
 *   node demo/probe.mjs 901 demo/empty-base-picker-probe.mjs
 *
 * Reported from iOS: the MultiMedia picker opened on nothing — no files, no error, nothing to
 * select. The iOS cause is not settled (it cannot be reproduced here), but one path was silent by
 * construction on every platform: a base query that succeeds and matches no files. The picker then
 * opens empty, and nothing tells the reader whether their base matched nothing or the picker
 * broke. This checks that the empty answer now names the base and the view.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("setup", await page.evaluate(async () => {
		const app = window.app;
		app.changeTheme?.("obsidian"); app.customCss?.setTheme?.("Minimal");
		// A view that matches nothing, bound to a MultiMedia field — the reporter's shape.
		const base = app.vault.getAbstractFileByPath("Images.base") ?? app.vault.getAbstractFileByPath("Books.base");
		const yaml = await app.vault.read(base);
		if (!yaml.includes("name: Nothing"))
			await app.vault.modify(base, `${yaml}  - type: table\n    name: Nothing\n    filters:\n      and:\n        - file.name == "no such file at all"\n    order:\n      - file.name\n`);
		const cls = app.vault.getAbstractFileByPath("Classes/Book.md");
		await app.fileManager.processFrontMatter(cls, (fm) => {
			const fields = fm.fields ?? [];
			const f = fields.find((x) => x.name === "gallery");
			const def = { name: "gallery", id: "gAllry", type: "MultiMedia", options: { baseFile: base.path, viewName: "Nothing" }, path: "" };
			if (f) Object.assign(f, def); else fields.push(def);
			fm.fields = fields;
		});
		await new Promise((r) => setTimeout(r, 3000));
		return { base: base.path };
	}));
	note("opening the picker", await page.evaluate(async () => {
		const app = window.app;
		const file = app.vault.getAbstractFileByPath("Dune.md");
		await app.fileManager.processFrontMatter(file, (fm) => { fm.gallery = []; });
		await new Promise((r) => setTimeout(r, 2000));
		await app.workspace.getLeaf(false).openFile(file);
		await new Promise((r) => setTimeout(r, 2500));
		const row = Array.from(document.querySelectorAll(".metadata-property")).find((r) => r.getAttribute("data-property-key") === "gallery");
		row?.querySelector(".fileclass-prop-edit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 3000));
		return {
			cards: document.querySelectorAll(".fileclass-multiselect-card, .suggestion-item").length,
			notices: Array.from(document.querySelectorAll(".notice")).map((n) => n.textContent.trim()).filter((t) => t.includes("Fileclass")),
		};
	}));
}
