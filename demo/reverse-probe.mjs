/*
 * #154 phases 1–3, measured end to end (§14).
 *
 *   node demo/probe.mjs 901 demo/reverse-probe.mjs
 *
 * The 901 fixture holds every case that matters: a plain link (Dune → Frank Herbert), an aliased
 * one (Atomic Habits → [[James Clear|Clear]]), and two authors sharing a basename in different
 * folders (Sandworms → Reading list/Archive/Frank Herbert). It also declares two fields drawing
 * from the *same* source view — `Book.author` (File) and `Comic.contributors` (MultiFile) — which
 * is what the discovery guardrail is about.
 *
 * What this asks, in order: are both relations discovered; is the view written once and reused by
 * the next author; does the embedded table show the right rows for its own host; and does the
 * namesake stay out.
 */
import { mkdirSync } from "node:fs";
const OUT = "/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/fileclass/demo/.probe-out";

export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	mkdirSync(OUT, { recursive: true });
	await sleep(3000);

	const open = (path) =>
		page.evaluate(async (p) => {
			const file = window.app.vault.getAbstractFileByPath(p);
			if (!file) return `(missing ${p})`;
			const leaf = window.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			// Source mode, so the cursor path is the one under test.
			await leaf.view.setState({ ...leaf.view.getState(), mode: "source" }, {});
			return leaf.view.file.path;
		}, path);

	const run = () =>
		page.evaluate(() => window.app.commands.executeCommandById("fileclass:insert-reverse-relation"));

	const modalItems = () =>
		page.evaluate(() =>
			Array.from(document.querySelectorAll(".suggestion-item")).map((el) => el.textContent.trim())
		);

	const pick = (label) =>
		page.evaluate((wanted) => {
			const el = Array.from(document.querySelectorAll(".suggestion-item")).find(
				(e) => e.textContent.trim() === wanted
			);
			if (!el) return "(not found)";
			el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return wanted;
		}, label);

	const read = (path) =>
		page.evaluate(async (p) => {
			const f = window.app.vault.getAbstractFileByPath(p);
			return f ? await window.app.vault.read(f) : `(missing ${p})`;
		}, path);

	// The base to create the view in is asked once, on the run that creates it.
	const confirmBase = () =>
		page.evaluate(() => {
			const modal = document.querySelector(".modal-container .modal");
			if (!modal) return "(no base prompt)";
			const path = modal.querySelector("input[type=text]")?.value ?? "(no field)";
			const cta = Array.from(modal.querySelectorAll("button")).find(
				(b) => b.textContent.trim() === "Create the view"
			);
			if (!cta) return "(no button)";
			cta.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return path;
		});

	const notices = () =>
		page.evaluate(() =>
			Array.from(document.querySelectorAll(".notice")).map((n) => n.textContent.trim())
		);

	// -- 1. discovery: two relations, one source view ------------------------------------------
	note("opened", await open("Frank Herbert.md"));
	await sleep(800);
	await run();
	await sleep(6000);
	note("candidates offered", await modalItems());
	note("picked", await pick("Book.author"));
	await sleep(2500);
	note("base offered", await confirmBase());
	await sleep(4000);
	note("notices", await notices());

	// -- 2. what was written ------------------------------------------------------------------
	note("Books.base", await read("Books.base"));
	note("host body", await read("Frank Herbert.md"));

	// -- 3. the rows the host sees ------------------------------------------------------------
	const rows = async () => {
		await page.evaluate(async () => {
			const leaf = window.app.workspace.getActiveViewOfType(
				window.app.workspace.getActiveFileView().constructor
			);
			await leaf.setState({ ...leaf.getState(), mode: "preview" }, {});
		});
		await new Promise((r) => setTimeout(r, 4000));
		return page.evaluate(() => {
			const embed = document.querySelector('.internal-embed[src*="Books.base"]');
			if (!embed) return "(no embed rendered)";
			const cells = Array.from(embed.querySelectorAll(".bases-tr, tr")).map((r) =>
				r.textContent.trim()
			);
			return cells.length ? cells : embed.textContent.trim().slice(0, 300);
		});
	};
	note("rows for Frank Herbert", await rows());
	await page.screenshot({ path: `${OUT}/reverse-frank-herbert.png` });

	// -- 4. the second author reuses the view --------------------------------------------------
	note("opened", await open("Mary Shelley.md"));
	await sleep(800);
	await run();
	await sleep(6000);
	note("candidates offered", await modalItems());
	note("picked", await pick("Book.author"));
	await sleep(2500);
	// Nothing to decide from the second author on: the view already exists.
	note("base prompt on reuse", await confirmBase());
	await sleep(4000);
	note("notices", await notices());
	note("Books.base view names", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Books.base");
		const yaml = await window.app.vault.read(f);
		return yaml.split("\n").filter((l) => l.includes("name:")).map((l) => l.trim());
	}));
	note("rows for Mary Shelley", await rows());

	// -- 5. an aliased link, and the namesake --------------------------------------------------
	note("opened", await open("James Clear.md"));
	await sleep(800);
	await run();
	await sleep(6000);
	await pick("Book.author");
	await sleep(2500);
	await confirmBase();
	await sleep(4000);
	note("rows for James Clear (aliased link)", await rows());

	note("opened", await open("Reading list/Archive/Frank Herbert.md"));
	await sleep(800);
	await run();
	await sleep(6000);
	await pick("Book.author");
	await sleep(2500);
	await confirmBase();
	await sleep(4000);
	note("rows for the namesake", await rows());
	await page.screenshot({ path: `${OUT}/reverse-namesake.png` });
}
