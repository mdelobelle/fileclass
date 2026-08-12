/*
 * #159, the trap underneath it: what happens to a schema when the note it points at is renamed.
 *
 *   node demo/probe.mjs 901 demo/rename-stale-probe.mjs
 *
 * Obsidian rewrites links in note bodies on a rename. A `valuesListNotePath` — or a `baseFile`, or
 * a `canvasPath` — is a plain string inside a class note's `fields:`, so nothing rewrites it. This
 * asks what the field is worth afterwards, and says it in numbers rather than in theory.
 *
 * The stored paths are **expected to stay as they are**: Fileclass warns and logs, and never edits
 * a definition. What this probe pins down is that the reference really does go dangling — the fact
 * the warning exists for — and that nothing silently repairs it behind the reader's back.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	note("fixture", await page.evaluate(async () => {
		const v = window.app.vault;
		await v.createFolder("Values").catch(() => {});
		if (!v.getAbstractFileByPath("Values/Rating.md")) {
			await v.create("Values/Rating.md", "low\nmedium\nhigh\n");
		}
		const cls = v.getAbstractFileByPath("Classes/Book.md");
		const yaml = await v.read(cls);
		if (!yaml.includes("plan.erledigt.rating")) {
			await v.modify(
				cls,
				yaml.replace(
					"fields:\n",
					"fields:\n  - name: plan.erledigt.rating\n    id: Y9fhcD\n    type: Select\n" +
						"    options:\n      sourceType: ValuesListNotePath\n" +
						'      valuesListNotePath: Values/Rating.md\n    path: ""\n'
				)
			);
		}
		return (await v.read(cls)).match(/valuesListNotePath: (\S+)/)[1];
	}));
	await sleep(2500);

	/** Does the path the schema stores still point at a file? That is the whole mechanism. */
	const resolves = () =>
		page.evaluate(async () => {
			const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
			const path = yaml.match(/valuesListNotePath: (\S+)/)?.[1];
			return { path, exists: !!window.app.vault.getAbstractFileByPath(path) };
		});
	note("stored path resolves, before", await resolves());

	// The gesture: rename the values note in the vault, the way anyone would.
	note("renamed", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Values/Rating.md");
		await window.app.fileManager.renameFile(f, "Values/Rating-2026.md");
		return !!window.app.vault.getAbstractFileByPath("Values/Rating-2026.md");
	}));
	await sleep(3000);

	note("path in the class note after rename", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		return yaml.match(/valuesListNotePath: (\S+)/)?.[1] ?? "(none)";
	}));
	note("stored path resolves, after", await resolves());

	// And the same question for a base a field draws candidates from.
	note("base path before", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		return yaml.match(/baseFile: (\S+)/)?.[1] ?? "(none)";
	}));
	note("renamed the base", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Authors.base");
		await window.app.fileManager.renameFile(f, "Writers.base");
		return !!window.app.vault.getAbstractFileByPath("Writers.base");
	}));
	await sleep(3000);
	note("author field's baseFile after rename", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		const at = yaml.indexOf("name: author");
		return yaml.slice(at, at + 160);
	}));
	note("class baseFile after rename", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		return yaml.match(/^baseFile: (\S+)/m)?.[1] ?? "(none)";
	}));

	// A folder a class claims, renamed.
	note("filesPaths before", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		return yaml.match(/filesPaths:\n(?:\s+- .*\n)+/)?.[0]?.trim() ?? "(none)";
	}));
	note("renamed the folder", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Reading list");
		if (!f) return "(no folder)";
		await window.app.fileManager.renameFile(f, "Library");
		return !!window.app.vault.getAbstractFileByPath("Library");
	}));
	await sleep(3000);
	note("filesPaths after", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		return yaml.match(/filesPaths:\n(?:\s+- .*\n)+/)?.[0]?.trim() ?? "(none)";
	}));
}
