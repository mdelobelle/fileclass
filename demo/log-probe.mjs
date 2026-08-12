/*
 * The schema log (#159): what it records, and what it refuses to record twice.
 *
 *   node demo/probe.mjs 901 demo/log-probe.mjs
 *
 * The 901 fixture is internally consistent — every base, canvas and folder its classes name exists
 * — so anything the sweep reports here was broken by this script, on purpose.
 *
 * The log is deleted first. A probe whose result depends on what an earlier run left behind is a
 * probe that proves nothing, and this one is about accumulation.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	note("cleared", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Classes/fileclass.log");
		if (f) await window.app.vault.delete(f);
		return !window.app.vault.getAbstractFileByPath("Classes/fileclass.log");
	}));

	const sweep = async () => {
		await page.evaluate(() => window.app.commands.executeCommandById("fileclass:audit-schemas"));
		await sleep(3000);
		await page.evaluate(() => document.querySelectorAll(".notice").forEach((n) => n.remove()));
	};
	/** Level + event + message, which is what a reader scans. */
	const log = () =>
		page.evaluate(async () => {
			const f = window.app.vault.getAbstractFileByPath("Classes/fileclass.log");
			if (!f) return [];
			return (await window.app.vault.read(f))
				.split("\n")
				.filter((l) => l && !l.startsWith("#"))
				.map((l) => l.split("\t").slice(1, 4).join(" "));
		});
	const setBase = (value) =>
		page.evaluate(async (v) => {
			const f = window.app.vault.getAbstractFileByPath("Classes/Book.md");
			const y = await window.app.vault.read(f);
			await window.app.vault.modify(f, y.replace(/baseFile: \S+\.base/, `baseFile: ${v}`));
			return v;
		}, value);

	note("broke Book › author", await setBase("Gone.base"));
	await sleep(2500);
	await sweep();
	note("after the first sweep", await log());

	// The behaviour the whole design turns on: sweeping again says nothing new.
	await sweep();
	await sweep();
	note("after two more sweeps", await log());

	note("fixed it", await setBase("Authors.base"));
	await sleep(2500);
	await sweep();
	note("after fixing", await log());

	note("broke it again", await setBase("Gone.base"));
	await sleep(2500);
	await sweep();
	note("after breaking it again", await log());
}
