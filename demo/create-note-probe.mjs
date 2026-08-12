/*
 * #84 end to end: a note created with a class, from a reverse-relation table.
 *
 *   node demo/probe.mjs 901 demo/create-note-probe.mjs
 *
 * The ordering is what this pins down, since it is the issue's actual design: the template is
 * applied first and the fields second, so the note ends with **one** frontmatter block, the
 * template's own values kept, and the seed — the author the table is about — winning over the
 * template on that one field.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);
	note("template + class option", await page.evaluate(async () => {
		const v = window.app.vault;
		await v.createFolder("Templates").catch(() => {});
		const path = "Templates/Book template.md";
		if (!v.getAbstractFileByPath(path)) {
			await v.create(path, "---\npublisher: Chilton Books\nauthor: \"[[Somebody Else]]\"\n---\n\n## Notes on {{title}}\n");
		}
		const cls = v.getAbstractFileByPath("Classes/Book.md");
		const y = await v.read(cls);
		await v.modify(cls, y.replace("baseFile: Books.base", `fileClassNoteTemplate: ${path}\nbaseFile: Books.base`));
		return path;
	}));
	await sleep(3000);
	note("core Templates enabled", await page.evaluate(() =>
		!!window.app.internalPlugins?.getPluginById?.("templates")?.enabled
	));

	// Seeded creation: the template sets `author`, the seed must win on that field only.
	note("host prepared", await page.evaluate(async () => {
		const v = window.app.vault;
		const f = v.getAbstractFileByPath("Books.base");
		const yaml = await v.read(f);
		if (!yaml.includes("Book by author")) {
			await v.modify(f, yaml + "  - type: fileclass-table\n    name: Book by author\n    filters:\n      and:\n        - fileClass.containsAny(\"Book\")\n        - author == this.file.asLink()\n    order:\n      - file.name\n");
		}
		const host = v.getAbstractFileByPath("Frank Herbert.md");
		const body = await v.read(host);
		if (!body.includes("Books.base#Book by author")) await v.modify(host, `${body}\n![[Books.base#Book by author]]\n`);
		await window.app.workspace.getLeaf(false).openFile(host);
		return true;
	}));
	await sleep(6000);
	await page.evaluate(() => {
		document.querySelector(".fileclass-toolbar-new .text-icon-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(1800);
	await page.evaluate(() => {
		const modal = Array.from(document.querySelectorAll(".modal")).pop();
		const input = modal?.querySelector("input");
		if (input) { input.value = "Heretics of Dune"; input.dispatchEvent(new Event("input", { bubbles: true })); }
		Array.from(modal?.querySelectorAll("button") ?? []).find((b) => b.textContent.trim() === "Create")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(4000);
	note("the note", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Reading list/Heretics of Dune.md");
		return f ? await window.app.vault.read(f) : "(missing)";
	}));
}
