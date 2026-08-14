/*
 * How many items do the File / MultiFile pickers actually show?
 *
 *   node demo/probe.mjs 901 demo/suggest-limit-probe.mjs
 *
 * Two different modals, so two different answers: `File`/`Media` go through a SuggestModal
 * (Obsidian's, which caps), `MultiFile`/`MultiMedia` through our own MultiSelectModal (which
 * renders a row per option). Counted here over a class with far more notes than either default,
 * rather than read off the typings.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	// 400 authors — more than any plausible default.
	note(
		"authors created",
		await page.evaluate(async () => {
			const app = window.app;
			for (let i = 0; i < 400; i++) {
				const path = `Probe author ${String(i).padStart(3, "0")}.md`;
				if (!app.vault.getAbstractFileByPath(path))
					await app.vault.create(path, `---\nfileClass: Author\n---\n`).catch(() => {});
			}
			return app.vault.getMarkdownFiles().filter((f) => f.basename.startsWith("Probe author")).length;
		})
	);
	await sleep(4000);

	/** Opens a note, then the field's picker through the property control the plugin draws. */
	const openPicker = async (notePath, fieldName) => {
		await page.evaluate(
			async ([path]) => {
				const leaf = window.app.workspace.getLeaf(false);
				await leaf.openFile(window.app.vault.getAbstractFileByPath(path));
			},
			[notePath]
		);
		await sleep(2500);
		return page.evaluate(
			async ([field]) => {
				const rows = Array.from(document.querySelectorAll(".metadata-property"));
				const row = rows.find((r) => r.getAttribute("data-property-key") === field);
				const button = row?.querySelector(".fileclass-prop-edit");
				if (!button) return { opened: false, keys: rows.map((r) => r.getAttribute("data-property-key")) };
				button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				await new Promise((r) => setTimeout(r, 1500));
				return { opened: true };
			},
			[fieldName]
		);
	};

	const counts = () =>
		page.evaluate(() => ({
			suggestionItems: document.querySelectorAll(".suggestion-item").length,
			multiSelectRows: document.querySelectorAll(".modal-content .fileclass-filter-row ~ * .setting-item, .modal-content .setting-item").length,
			modalRowsAnyClass: document.querySelectorAll(".modal-content .setting-item").length,
			promptOpen: !!document.querySelector(".prompt"),
			modalOpen: !!document.querySelector(".modal-container"),
		}));

	note("open File picker (Book.author)", await openPicker("Dune.md", "author"));
	note("File picker rows", await counts());
	note(
		"result container",
		await page.evaluate(() => {
			const item = document.querySelector(".suggestion-item");
			const chain = [];
			for (let e = item; e && chain.length < 4; e = e.parentElement) chain.push(e.className);
			return chain;
		})
	);

		// Scrolling to the bottom should draw the next page, and keep the reader where they were.
	note(
		"scroll to bottom, twice",
		await page.evaluate(async () => {
			const el = document.querySelector(".suggestion-item")?.closest(".prompt-results, .suggestion-container, .prompt > div");
			const out = [];
			for (let i = 0; i < 2; i++) {
				el.scrollTop = el.scrollHeight;
				el.dispatchEvent(new Event("scroll"));
				await new Promise((r) => setTimeout(r, 600));
				out.push({
					items: document.querySelectorAll(".suggestion-item").length,
					scrollTop: Math.round(el.scrollTop),
					count: document.querySelector(".fileclass-suggest-count")?.textContent ?? null,
				});
			}
			return out;
		})
	);

	// Typing narrows, and starts from one page again.
	note(
		"after typing",
		await page.evaluate(async () => {
			const input = document.querySelector(".prompt-input");
			input.value = "Probe author 1";
			input.dispatchEvent(new Event("input"));
			await new Promise((r) => setTimeout(r, 700));
			return {
				items: document.querySelectorAll(".suggestion-item").length,
				count: document.querySelector(".fileclass-suggest-count")?.textContent ?? null,
			};
		})
	);

	await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
	await sleep(800);
	note("open MultiFile picker (Comic.contributors)", await openPicker("The Yellow M.md", "contributors"));
	note("MultiFile picker rows", await counts());
	note(
		"MultiFile modal weight",
		await page.evaluate(() => ({
			domNodes: document.querySelector(".modal-content")?.querySelectorAll("*").length ?? null,
		}))
	);
}
