/*
 * The point of asking (#154): the reader sends the view somewhere other than the class's base, and
 * the next note has to find it *there* — reuse is by view name, not by a path derived from the class.
 *
 *   node demo/probe.mjs 901 demo/reverse-elsewhere.mjs
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	const open = (path) =>
		page.evaluate(async (p) => {
			const leaf = window.app.workspace.getLeaf(false);
			await leaf.openFile(window.app.vault.getAbstractFileByPath(p));
			await leaf.view.setState({ ...leaf.view.getState(), mode: "source" }, {});
			return leaf.view.file.path;
		}, path);

	const runAndPick = async () => {
		await page.evaluate(() =>
			window.app.commands.executeCommandById("fileclass:insert-reverse-relation")
		);
		await sleep(6000);
		return page.evaluate(() => {
			const el = Array.from(document.querySelectorAll(".suggestion-item")).find(
				(e) => e.textContent.trim() === "Book.author"
			);
			el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return !!el;
		});
	};

	/** Types `path` into the base prompt and submits; reports what it found there first. */
	const chooseBase = (path) =>
		page.evaluate((wanted) => {
			const modal = document.querySelector(".modal-container .modal");
			if (!modal) return "(no prompt)";
			const input = modal.querySelector("input[type=text]");
			const offered = input?.value;
			if (input && wanted) {
				input.value = wanted;
				// onChange listens to input events; setting .value alone would be ignored.
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
			Array.from(modal.querySelectorAll("button"))
				.find((b) => b.textContent.trim() === "Create the view")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return offered;
		}, path);

	const body = (path) =>
		page.evaluate(async (p) => {
			const f = window.app.vault.getAbstractFileByPath(p);
			return f ? (await window.app.vault.read(f)).split("\n").filter((l) => l.includes("![[")) : "(missing)";
		}, path);

	// -- the reader sends it to a dashboard base that does not exist yet -----------------------
	note("opened", await open("Frank Herbert.md"));
	await sleep(600);
	note("picked", await runAndPick());
	await sleep(2500);
	note("offered by default", await chooseBase("Dashboards/Reading.base"));
	await sleep(4000);
	note("created there", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Dashboards/Reading.base");
		return f ? await window.app.vault.read(f) : "(not created)";
	}));
	note("embed in Frank Herbert", await body("Frank Herbert.md"));
	note("Books.base untouched", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Books.base"));
		return yaml.includes("Book by author") ? "(view leaked into Books.base)" : "no reverse view";
	}));

	// -- the next author must find it there, with nothing asked --------------------------------
	note("opened", await open("Mary Shelley.md"));
	await sleep(600);
	note("picked", await runAndPick());
	await sleep(2500);
	note("prompted again", await chooseBase(null));
	await sleep(4000);
	note("embed in Mary Shelley", await body("Mary Shelley.md"));
	note("still one view", await page.evaluate(async () => {
		const f = window.app.vault.getAbstractFileByPath("Dashboards/Reading.base");
		const yaml = await window.app.vault.read(f);
		return (yaml.match(/Book by author/g) ?? []).length;
	}));
}
