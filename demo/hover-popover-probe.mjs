/*
 * The controls in a hover preview, and the note they belong to.
 *
 *   node demo/probe.mjs 901 demo/hover-popover-probe.mjs
 *
 * A hover popover renders in **reading** mode, so there is no editor to ask which file it shows —
 * which is why a previewed note used to carry only the fileClass wrench, the one control that needs
 * no file. The file is now stamped on the popover as it appears, from the hover the workspace
 * announced.
 *
 * What this asserts is not that buttons appear, but that they belong to the **right** note: two
 * links hovered one after the other, and a popover-shaped element appearing without a recent hover,
 * which must stay undecorated rather than borrow the last note's fields.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("setup", await page.evaluate(async () => {
		const app = window.app;
		const pp = app.internalPlugins.getPluginById("page-preview");
		if (!pp.enabled) await pp.enable();
		const path = "__hover two.md";
		const old = app.vault.getAbstractFileByPath(path);
		if (old) await app.vault.delete(old);
		const f = await app.vault.create(path, "---\nfileClass: Book\n---\n\nOne [[Dune]] and one [[Tintin in Tibet]].\n");
		await new Promise((r) => setTimeout(r, 2000));
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(f);
		await leaf.setViewState({ type: "markdown", state: { file: path, mode: "preview" } });
		await new Promise((r) => setTimeout(r, 3000));
		return Array.from(document.querySelectorAll(".markdown-reading-view a.internal-link")).map((a) => a.textContent);
	}));
	const hoverNth = (n) => page.evaluate(async (i) => {
		// Move away first, so the previous popover closes rather than being reused.
		document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 5 }));
		await new Promise((r) => setTimeout(r, 1200));
		const links = Array.from(document.querySelectorAll(".markdown-reading-view a.internal-link"));
		const link = links[i];
		const r = link.getBoundingClientRect();
		const opts = { bubbles: true, clientX: r.x + 4, clientY: r.y + 4, ctrlKey: true, metaKey: true };
		link.dispatchEvent(new MouseEvent("mouseover", opts));
		link.dispatchEvent(new MouseEvent("mousemove", opts));
		await new Promise((r2) => setTimeout(r2, 2500));
		const pop = document.querySelector(".hover-popover");
		const rows = pop ? Array.from(pop.querySelectorAll(".metadata-property")) : [];
		return {
			hovered: link.textContent,
			stamped: pop?.dataset?.fcPath ?? null,
			title: pop?.querySelector(".inline-title")?.textContent ?? null,
			edits: rows.filter((x) => x.querySelector(".fileclass-prop-edit")).length,
		};
	}, n);
	note("hover the first link", await hoverNth(0));
	note("then the second", await hoverNth(1));
	note("a stale hover decorates nothing", await page.evaluate(async () => {
		// No hover-link event, but a popover-shaped element appears: nothing must be stamped.
		document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 5 }));
		await new Promise((r) => setTimeout(r, 3000));
		const el = document.body.createDiv({ cls: "popover hover-popover" });
		await new Promise((r) => setTimeout(r, 600));
		const stamped = el.dataset.fcPath ?? null;
		el.remove();
		return { stamped };
	}));
}
