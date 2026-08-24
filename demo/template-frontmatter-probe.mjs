/*
 * A template whose properties are one character out of position (#…).
 *
 *   node demo/902_templater/install-templater.mjs
 *   node demo/probe.mjs 902 demo/template-frontmatter-probe.mjs
 *
 * Reported on a production vault: every new note of a class carried its properties twice. The
 * class template began with a lone backtick, so its `---` block was not at position 0 — and
 * Obsidian reads frontmatter only there. The block was body text, the write that follows found no
 * frontmatter to merge into and added its own, and the template's values were lost with it.
 *
 * Two templates, same content, one with a leading backtick: whatever differs between the two notes
 * is the cause. Also asserts the warning that now names it — silence was the whole problem.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(4000);

	note("fixture", await page.evaluate(async () => {
		const app = window.app;
		const body = `---\nfileClass: Book\npublisher: Chilton Books\ngenre: Science fiction\n---\n\n## Notes\n`;
		await app.vault.create("Templates/Clean book.md", body).catch(() => {});
		await app.vault.create("Templates/Backtick book.md", "`\n" + body).catch(() => {});
		const cls = app.vault.getAbstractFileByPath("Classes/Book.md");
		await app.fileManager.processFrontMatter(cls, (fm) => {
			fm.newNotes = [
				{ name: "Clean", folder: "Reading list", template: "Templates/Clean book.md" },
				{ name: "Backtick", folder: "Reading list", template: "Templates/Backtick book.md" },
			];
		});
		await new Promise((r) => setTimeout(r, 3000));
		return { templater: !!app.plugins.plugins["templater-obsidian"] };
	}));

	const create = async (destination, name) => {
		await page.evaluate(async ([dest, noteName]) => {
			const app = window.app;
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(app.vault.getAbstractFileByPath("Classes/Book.md"));
			await new Promise((r) => setTimeout(r, 1200));
			app.commands.executeCommandById("fileclass:create-note");
			await new Promise((r) => setTimeout(r, 1500));
			// The destination picker (two destinations now), then the name.
			const items = Array.from(document.querySelectorAll(".suggestion-item"));
			items.find((el) => el.textContent.includes(dest))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 1500));
			const input = document.querySelector(".modal-container input");
			if (input) {
				input.value = noteName;
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			}
			await new Promise((r) => setTimeout(r, 4500));
			window.__fcNotices = Array.from(document.querySelectorAll(".notice")).map((n) => n.textContent.trim());
			document.querySelector(".modal-close-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		}, [destination, name]);
		await sleep(2000);
		return page.evaluate(async (noteName) => {
			const app = window.app;
			const file = app.vault.getMarkdownFiles().find((f) => f.basename === noteName);
			if (!file) return "(not created)";
			const raw = await app.vault.read(file);
			return {
				blocks: (raw.match(/^---$/gm) ?? []).length,
				propertiesInCache: Object.keys(app.metadataCache.getFileCache(file)?.frontmatter ?? {}).length,
				fileClassAppears: (raw.match(/fileClass:/g) ?? []).length,
				head: raw.slice(0, 120),
				notices: (window.__fcNotices ?? []).filter((t) => t.includes("Fileclass")),
			};
		}, name);
	};

	note("a clean template", await create("Clean", "Clean note"));
	note("a template with a backtick above its properties", await create("Backtick", "Backtick note"));
}
