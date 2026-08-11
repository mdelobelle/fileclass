/*
 * The docs picture for #154: an author note showing the books that point at it.
 *
 *   node demo/probe.mjs 901 demo/reverse-shot.mjs
 *
 * Writes `docs/static/reverse/reverse-relation.png`. The scene is prepared rather than staged:
 * the script trims the Book table to five columns first, then runs the real command — which is
 * also the behaviour worth showing, since the reverse view takes the shape of that table.
 */
import { mkdirSync } from "node:fs";
const OUT = "/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/fileclass/docs/static/reverse";

export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	mkdirSync(OUT, { recursive: true });
	await sleep(3000);

	// A Book table someone would actually keep in front of them.
	note("trimmed", await page.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath("Books.base");
		const yaml = await window.app.vault.read(file);
		const trimmed = yaml.replace(
			/( {2}- type: fileclass-table\n {4}name: Book\n(?: {4}\w+:[^\n]*\n(?: {6}[^\n]*\n)*)*? {4}order:\n)(?: {6}- [^\n]*\n)+/,
			"$1      - file.name\n      - author\n      - published\n      - genre\n      - ownership\n      - read\n"
		);
		await window.app.vault.modify(file, trimmed);
		return trimmed.includes("      - ownership\n      - read\n");
	}));
	await sleep(2000);

	note("opened", await page.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath("Frank Herbert.md");
		const leaf = window.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		await leaf.view.setState({ ...leaf.view.getState(), mode: "source" }, {});
		// Below the prose, so the picture reads as a note with a table at the end of it.
		leaf.view.editor.setCursor({ line: leaf.view.editor.lastLine(), ch: 0 });
		return leaf.view.file.path;
	}));
	await sleep(800);
	await page.evaluate(() =>
		window.app.commands.executeCommandById("fileclass:insert-reverse-relation")
	);
	await sleep(6000);
	note("picked", await page.evaluate(() => {
		const el = Array.from(document.querySelectorAll(".suggestion-item")).find(
			(e) => e.textContent.trim() === "Book.author"
		);
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		return !!el;
	}));
	await sleep(2500);
	// Where the view lives, asked once — the default is the class's own base.
	note("base offered", await page.evaluate(() => {
		const modal = document.querySelector(".modal-container .modal");
		const path = modal?.querySelector("input[type=text]")?.value ?? "(no prompt)";
		Array.from(modal?.querySelectorAll("button") ?? [])
			.find((b) => b.textContent.trim() === "Create the view")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		return path;
	}));
	await sleep(4000);

	// Reading mode: the table as a reader meets it, with no cursor artefacts.
	await page.evaluate(async () => {
		const leaf = window.app.workspace.getMostRecentLeaf();
		await leaf.view.setState({ ...leaf.view.getState(), mode: "preview" }, {});
	});
	await sleep(4000);
	// Let the notice fade rather than baking it into the picture.
	await page.evaluate(() => document.querySelectorAll(".notice").forEach((n) => n.remove()));

	const clip = await page.evaluate(() => {
		const el = document.querySelector(".workspace-leaf.mod-active .view-content, .markdown-reading-view");
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: r.left, y: r.top, width: r.width, height: r.height };
	});
	await page.screenshot({ path: `${OUT}/reverse-relation.png`, ...(clip ? { clip } : {}) });
	note("shot", clip ? `${Math.round(clip.width)}×${Math.round(clip.height)}` : "full window");
}
