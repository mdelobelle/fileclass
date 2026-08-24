/*
 * Reported: "Create note with a class" on a class whose template already declares properties
 * gives a note with its properties **twice**.
 *
 *   node demo/probe.mjs 901 demo/create-note-template-probe.mjs
 *
 * The command's own header claims a duplicate block is impossible by construction — the template
 * is applied first, then `processFrontMatter` merges into whatever it left. So this measures the
 * claim: a Person class with a template carrying frontmatter, the command driven end to end, and
 * the raw file read back.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	note(
		"fixture",
		await page.evaluate(async () => {
			const app = window.app;
			app.changeTheme?.("obsidian");
			app.customCss?.setTheme?.("Minimal");
			// The core Templates plugin is the engine available here (no Templater in a demo vault).
			await app.internalPlugins.getPluginById("templates")?.enable?.();
			await new Promise((r) => setTimeout(r, 800));

			await app.vault.create(
				"Templates/Person note.md",
				`---\nfileClass: Person\nrole: \nbirth: \n---\n\n## Notes\n`
			).catch(() => {});
			await app.vault.create(
				"Classes/Person.md",
				`---\nicon: user\nnewNotes:\n  - name: Contact\n    folder: People\n    template: Templates/Person note.md\nfields:\n  - name: role\n    id: rOle01\n    type: Input\n    options: {}\n    path: ""\n  - name: birth\n    id: bIrth1\n    type: Date\n    options: {}\n    path: ""\n  - name: city\n    id: cIty01\n    type: Input\n    options: {}\n    path: ""\n---\n`
			).catch(() => {});
			await new Promise((r) => setTimeout(r, 3000));
			return {
				engine: app.plugins.plugins["templater-obsidian"] ? "templater" : app.internalPlugins.getPluginById("templates")?.enabled ? "core" : "none",
				classFields: app.plugins.plugins.fileclass.index.getResolvedFields("Person").map((f) => f.name),
			};
		})
	);

	// Drive the command as a reader would. Opening the class note first is what makes the command
	// skip its picker: it takes the class of the note in front of you. The first run of this probe
	// left a Book note open, got a Book called John Doe, and measured a Book's frontmatter.
	note(
		"command",
		await page.evaluate(async () => {
			const app = window.app;
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(app.vault.getAbstractFileByPath("Classes/Person.md"));
			await new Promise((r) => setTimeout(r, 1500));
			app.commands.executeCommandById("fileclass:create-note");
			await new Promise((r) => setTimeout(r, 1500));
			const input = document.querySelector(".modal-container input");
			const prefilled = input?.value ?? null;
			if (input) {
				input.value = "John Doe";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			}
			await new Promise((r) => setTimeout(r, 4000));
			// The fields modal opens on top when the setting says so; close it.
			document.querySelector(".modal-close-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return { prefilled };
		})
	);

	await sleep(2500);

	note(
		"the note on disk",
		await page.evaluate(async () => {
			const app = window.app;
			const file = app.vault.getMarkdownFiles().find((f) => f.basename === "John Doe");
			if (!file) return "(no John Doe note)";
			const raw = await app.vault.read(file);
			const blocks = (raw.match(/^---$/gm) ?? []).length;
			return {
				path: file.path,
				frontmatterDelimiters: blocks,
				keysInCache: Object.keys(app.metadataCache.getFileCache(file)?.frontmatter ?? {}),
				raw,
			};
		})
	);
}
