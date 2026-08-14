/*
 * The MultiMedia picker as a gallery: cards instead of switches.
 *
 *   node demo/probe.mjs 901 demo/multimedia-gallery-probe.mjs
 *
 * Adds a MultiMedia field to Book, seeds a value on Dune (without one, the note has no property row
 * and there is nothing to open — the first run of this probe measured an empty screen), then checks
 * what the picker draws, that a card toggles, that the filter **actually hides** the others, and
 * that Save writes every ticked value.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	const D = process.env.CLAUDE_JOB_DIR + "/tmp/";
	await sleep(3000);
	note("setup", await page.evaluate(async () => {
		const app = window.app;
		app.changeTheme?.("moonstone"); app.customCss?.setTheme?.("Minimal");
		// Give Book a MultiMedia field, bound to the same candidates as `cover`.
		const file = app.vault.getAbstractFileByPath("Classes/Book.md");
		await app.fileManager.processFrontMatter(file, (fm) => {
			const fields = fm.fields ?? [];
			if (!fields.some((f) => f.name === "gallery"))
				fields.push({ name: "gallery", id: "gAllry", type: "MultiMedia", options: { folders: [] }, path: "" });
			fm.fields = fields;
		});
		await new Promise((r) => setTimeout(r, 3000));
		const dune = app.vault.getAbstractFileByPath("Dune.md");
		await app.fileManager.processFrontMatter(dune, (fm) => { fm.gallery = ["[[Dune.png]]"]; });
		await new Promise((r) => setTimeout(r, 2000));
		return app.plugins.plugins.fileclass.index.getResolvedFields("Book").filter((f) => f.name === "gallery").map((f) => f.type);
	}));
	note("picker", await page.evaluate(async () => {
		const app = window.app;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Dune.md"));
		await new Promise((r) => setTimeout(r, 3000));
		const row = Array.from(document.querySelectorAll(".metadata-property")).find((r) => r.getAttribute("data-property-key") === "gallery");
		if (!row) return "(no gallery row)";
		row.querySelector(".fileclass-prop-edit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 2500));
		const grid = document.querySelector(".fileclass-multiselect-gallery");
		const cards = Array.from(document.querySelectorAll(".fileclass-multiselect-card"));
		const style = grid ? getComputedStyle(grid) : null;
		const img = cards[0]?.querySelector("img")?.getBoundingClientRect();
		return {
			grid: !!grid,
			columns: style?.gridTemplateColumns?.split(" ").length ?? null,
			cards: cards.length,
			thumbHeight: img ? Math.round(img.height) : null,
			selected: cards.filter((c) => c.classList.contains("is-selected")).map((c) => c.textContent.trim()),
			switches: document.querySelectorAll(".fileclass-multiselect-gallery .checkbox-container").length,
		};
	}));
	note("click a card, then filter", await page.evaluate(async () => {
		const cards = Array.from(document.querySelectorAll(".fileclass-multiselect-card"));
		cards[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 400));
		const afterClick = cards.filter((c) => c.classList.contains("is-selected")).map((c) => c.textContent.trim());
		const input = document.querySelector(".fileclass-filter-input");
		input.value = "Dune"; input.dispatchEvent(new Event("input"));
		await new Promise((r) => setTimeout(r, 500));
		const visible = cards.filter((c) => !c.classList.contains("fileclass-filter-hidden")).map((c) => c.textContent.trim());
		return { afterClick, visibleWhenFiltered: visible };
	}));
	await page.screenshot({ path: D + "multimedia-gallery.png" });
	note("save writes both", await page.evaluate(async () => {
		const input = document.querySelector(".fileclass-filter-input");
		input.value = ""; input.dispatchEvent(new Event("input"));
		await new Promise((r) => setTimeout(r, 300));
		Array.from(document.querySelectorAll(".modal button")).find((b) => b.textContent.trim() === "Save")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 2500));
		return window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Dune.md"))?.frontmatter?.gallery;
	}));
}
