/*
 * Log retention (#159): the live file rolls over, archives are numbered monotonically, and the
 * oldest are pruned.
 *
 *   node demo/probe.mjs 901 demo/log-rotation-probe.mjs
 *
 * Runs with a cap of 3 entries and room for 2 archives, so a handful of break/fix rounds crosses
 * the threshold several times. Archives are read through `vault.adapter`: a dot-folder is written
 * to disk by the vault API and then never indexed by it — measured, and the reason the first
 * version of this probe reported "(none)" while the files were there.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	// A cap low enough to roll over on demand, and room for two archives only.
	note("settings", await page.evaluate(async () => {
		const p = window.app.plugins.plugins.fileclass;
		p.settings.schemaLogMaxEntries = 3;
		p.settings.schemaLogArchives = 2;
		await p.saveSettings();
		const f = window.app.vault.getAbstractFileByPath("Classes/fileclass.log");
		if (f) await window.app.vault.delete(f);
		return { max: p.settings.schemaLogMaxEntries, keep: p.settings.schemaLogArchives };
	}));

	// Each break/fix pair writes two entries, so a few rounds cross the cap several times.
	const setBase = (v) =>
		page.evaluate(async (value) => {
			const f = window.app.vault.getAbstractFileByPath("Classes/Book.md");
			const y = await window.app.vault.read(f);
			await window.app.vault.modify(f, y.replace(/baseFile: \S+\.base/, `baseFile: ${value}`));
		}, v);
	const sweep = async () => {
		await page.evaluate(() => window.app.commands.executeCommandById("fileclass:audit-schemas"));
		await sleep(2200);
		await page.evaluate(() => document.querySelectorAll(".notice").forEach((n) => n.remove()));
	};
	// Archives are read through the adapter: a dot-folder is never indexed by the vault API
	// (measured — getAbstractFileByPath returns null while adapter.list shows the files).
	const state = () =>
		page.evaluate(async () => {
			const v = window.app.vault;
			const live = v.getAbstractFileByPath("Classes/fileclass.log");
			const exists = await v.adapter.exists("Classes/.logs");
			const listing = exists ? await v.adapter.list("Classes/.logs") : { files: [] };
			return {
				live: live ? (await v.read(live)).split("\n").filter((l) => l && !l.startsWith("#")).length : "(none)",
				archives: listing.files.map((f) => f.slice(f.lastIndexOf("/") + 1)).sort(),
			};
		});

	for (let i = 0; i < 8; i++) {
		await setBase(`Gone${i}.base`);
		await sleep(1500);
		await sweep();
		await setBase("Authors.base");
		await sleep(1500);
		await sweep();
		note(`round ${i + 1}`, await state());
	}

	note("archived entries readable", await page.evaluate(async () => {
		const listing = await window.app.vault.adapter.list("Classes/.logs");
		const first = listing.files.sort()[0];
		if (!first) return "(none)";
		const body = await window.app.vault.adapter.read(first);
		return { name: first, entries: body.split("\n").filter((l) => l && !l.startsWith("#")).length };
	}));
}
