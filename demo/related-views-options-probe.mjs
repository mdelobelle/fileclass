/*
 * Declaring and undeclaring a related view from the class's options.
 *
 *   node demo/probe.mjs 901 demo/related-views-options-probe.mjs
 *
 * Two instrument notes, both learned the hard way here: the dropdowns must be scoped to the modal
 * on top (the options modal underneath has selects of its own, and a probe that queried the document
 * set the wrong ones), and each dropdown renders **two** `<select>`s, one a single-option decoy — so
 * they are found by what they hold rather than by their position.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("open options", await page.evaluate(async () => {
		const app = window.app;
		app.changeTheme?.("obsidian"); app.customCss?.setTheme?.("Minimal");
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(app.vault.getAbstractFileByPath("Classes/Book.md"));
		await new Promise((r) => setTimeout(r, 2500));
		Array.from(document.querySelectorAll(".metadata-container .fileclass-prop-action"))
			.find((e) => e.textContent.trim() === "Options")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 2000));
		return { extendsBefore: window.app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Classes/Book.md"))?.frontmatter?.extends };
	}));
	note("the add modal, scoped to itself", await page.evaluate(async () => {
		Array.from(document.querySelectorAll(".fileclass-related-list button")).find((b) => b.textContent.trim() === "Add new")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 2500));
		// The topmost modal is mine; the options modal underneath has selects of its own.
		const mine = Array.from(document.querySelectorAll(".modal")).find((m) => m.textContent.includes("Add a related view"));
		// Each dropdown renders two <select>s under this theme, one of them a single-option decoy —
		// so they are found by what they hold, not by their position.
		const all = Array.from(mine?.querySelectorAll("select") ?? []);
		const values = (sel) => Array.from(sel.options).map((o) => o.value);
		const selects = [
			all.find((s) => values(s).some((v) => !v.includes("#") && v && !v.includes(" ("))),
			all.find((s) => values(s).some((v) => v.includes("#"))),
		];
		const fields = values(selects[0]);
		const views = values(selects[1]);
		const pick = (sel, value) => { sel.value = value; sel.dispatchEvent(new Event("change")); };
		const bookView = views.find((v) => v.endsWith("Books.base#Book"));
		const reverse = views.find((v) => v.includes("Book by author"));
		pick(selects[0], "author");
		pick(selects[1], bookView);
		await new Promise((r) => setTimeout(r, 500));
		const warn = mine.querySelector(".fileclass-related-warning");
		const onPlainView = { shown: getComputedStyle(warn).display !== "none", text: warn.textContent.slice(0, 60) };
		pick(selects[1], reverse);
		await new Promise((r) => setTimeout(r, 500));
		const onReverseView = { shown: getComputedStyle(warn).display !== "none" };
		// Declare a second view for the same field: the managed one.
		pick(selects[1], bookView);
		await new Promise((r) => setTimeout(r, 300));
		Array.from(mine.querySelectorAll("button")).find((b) => b.textContent.trim() === "Add")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 1200));
		return {
			fields,
			views: views.slice(0, 3),
			onPlainView,
			onReverseView,
			rows: Array.from(document.querySelectorAll(".fileclass-related-list .setting-item .setting-item-name")).map((e) => e.textContent.trim()).filter(Boolean),
		};
	}));
	note("saved", await page.evaluate(async () => {
		Array.from(document.querySelectorAll(".modal button")).find((b) => b.textContent.trim() === "Save")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 2500));
		const fm = window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Classes/Book.md"))?.frontmatter;
		return { relatedViews: fm?.relatedViews, extends: fm?.extends, baseView: fm?.baseView };
	}));
}
