/*
 * #207: a Boolean field arrives in a note as a **text** property, and stays text.
 *
 *   node demo/probe.mjs 901 demo/boolean-property-probe.mjs
 *
 * Suspicion: `defaultValueFor` gives every type it does not name an empty string, Boolean
 * included — so the first value Obsidian ever sees for that property is `""`, and it registers the
 * property as text. This measures what the app actually does: what we write, what Obsidian infers,
 * and what each candidate fix would produce.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	note("the type manager's surface", await page.evaluate(() => {
		const m = window.app.metadataTypeManager;
		if (!m) return "(no metadataTypeManager)";
		const proto = Object.getPrototypeOf(m);
		return {
			keys: Object.getOwnPropertyNames(m).slice(0, 12),
			methods: Object.getOwnPropertyNames(proto).filter((k) => typeof m[k] === "function").slice(0, 20),
			knownTypes: Object.entries(m.properties ?? {}).slice(0, 3).map(([k, v]) => [k, v?.type]),
		};
	}));

	note("add a Boolean field, then insert it", await page.evaluate(async () => {
		const app = window.app;
		const cls = app.vault.getAbstractFileByPath("Classes/Book.md");
		await app.fileManager.processFrontMatter(cls, (fm) => {
			const fields = fm.fields ?? [];
			if (!fields.some((f) => f.name === "signed"))
				fields.push({ name: "signed", id: "sIgned", type: "Boolean", options: {}, path: "" });
			fm.fields = fields;
		});
		await new Promise((r) => setTimeout(r, 3000));
		// Insert missing fields on a note of the class, the way the reporter does.
		const note = app.vault.getAbstractFileByPath("Dune.md");
		const ids = Object.keys(app.commands.commands).filter((i) => i.includes("insert-missing"));
		await app.workspace.getLeaf(false).openFile(note);
		await new Promise((r) => setTimeout(r, 1500));
		app.commands.executeCommandById(ids[0]);
		await new Promise((r) => setTimeout(r, 2500));
		const raw = await app.vault.read(note);
		const line = raw.split("\n").find((l) => l.startsWith("signed"));
		return {
			commandUsed: ids[0],
			writtenLine: line ?? "(not written)",
			valueInCache: app.metadataCache.getFileCache(note)?.frontmatter?.signed,
			obsidianType: app.metadataTypeManager?.properties?.signed?.type ?? null,
			// What Obsidian shows in the Properties panel for that row.
			widget: (() => {
				const row = Array.from(document.querySelectorAll(".metadata-property")).find(
					(r) => r.getAttribute("data-property-key") === "signed"
				);
				return row?.getAttribute("data-property-type") ?? null;
			})(),
		};
	}));

	// The reporter's own step: close the note, reopen it, and see whether the checkbox held.
	note(
		"after closing and reopening the note",
		await page.evaluate(async () => {
			const app = window.app;
			app.workspace.detachLeavesOfType("markdown");
			await new Promise((r) => setTimeout(r, 1500));
			const file = app.vault.getAbstractFileByPath("Dune.md");
			await app.workspace.getLeaf(false).openFile(file);
			await new Promise((r) => setTimeout(r, 2500));
			const row = Array.from(document.querySelectorAll(".metadata-property")).find(
				(r) => r.getAttribute("data-property-key") === "signed"
			);
			const m = app.metadataTypeManager;
			return {
				valueInFile: (await app.vault.read(file)).split("\n").find((l) => l.startsWith("signed")),
				inferred: m.properties?.signed?.widget ?? null,
				assigned: m.assignedWidgets?.signed?.widget ?? null,
				drawsCheckbox: !!row?.querySelector("input[type='checkbox']"),
			};
		})
	);

	// And a type the plugin must not guess at: File stays whatever the reader made it.
	note(
		"a type we do not name",
		await page.evaluate(() => {
			const m = window.app.metadataTypeManager;
			return { author: m.assignedWidgets?.author?.widget ?? null };
		})
	);
}
