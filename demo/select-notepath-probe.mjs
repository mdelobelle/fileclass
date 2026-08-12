/*
 * #159 — editing the "Note path" of a `Select` fed by a note's lines does not stick.
 *
 *   node demo/probe.mjs 901 demo/select-notepath-probe.mjs
 *
 * Reproduced with the reporter's shape: a field name carrying dots (`plan.erledigt.rating`),
 * `sourceType: ValuesListNotePath`, `required: true`, on a class that `extends` another.
 * Drives the real UI — schema editor › field › Note path › Save — then reads the class note back.
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	// -- the reporter's setup ------------------------------------------------------------------
	note("fixture", await page.evaluate(async () => {
		const v = window.app.vault;
		await v.createFolder("Values").catch(() => {});
		for (const [path, body] of [
			["Values/Old-Rating.md", "one\ntwo\nthree\n"],
			["Values/New-Rating.md", "alpha\nbeta\n"],
		]) {
			if (!v.getAbstractFileByPath(path)) await v.create(path, body);
		}
		const cls = v.getAbstractFileByPath("Classes/Book.md");
		const yaml = await v.read(cls);
		if (!yaml.includes("plan.erledigt.rating")) {
			await v.modify(
				cls,
				yaml.replace(
					"fields:\n",
					"fields:\n" +
						"  - name: plan.erledigt.rating\n" +
						"    id: Y9fhcD\n" +
						"    type: Select\n" +
						"    options:\n" +
						"      sourceType: ValuesListNotePath\n" +
						"      valuesListNotePath: Values/Old-Rating.md\n" +
						"      required: true\n" +
						'    path: ""\n'
				)
			);
		}
		return (await v.read(cls)).includes("Values/Old-Rating.md");
	}));
	await sleep(2500);

	// -- open the class schema, then the field ---------------------------------------------------
	await page.evaluate(() => window.app.commands.executeCommandById("fileclass:edit-class-schema"));
	await sleep(2000);
	note("class picker", await page.evaluate(() => {
		const el = Array.from(document.querySelectorAll(".suggestion-item")).find(
			(e) => e.textContent.trim() === "Book"
		);
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		return !!el;
	}));
	await sleep(2000);
	note("row controls", await page.evaluate(() => {
		const row = Array.from(document.querySelectorAll(".modal .setting-item")).find((r) =>
			r.querySelector(".setting-item-name")?.textContent.trim() === "plan.erledigt.rating"
		);
		if (!row) return "(field not listed)";
		return Array.from(row.querySelectorAll("button, .clickable-icon")).map((b, i) => ({
			i,
			label: b.getAttribute("aria-label") || b.textContent.trim(),
			icon: (b.querySelector("svg")?.getAttribute("class") || "").replace("svg-icon lucide-", ""),
		}));
	}));
	note("field row clicked", await page.evaluate(() => {
		const row = Array.from(document.querySelectorAll(".modal .setting-item")).find((r) =>
			r.querySelector(".setting-item-name")?.textContent.trim() === "plan.erledigt.rating"
		);
		const controls = Array.from(row?.querySelectorAll("button, .clickable-icon") ?? []);
		// The edit control, by its label rather than its position among the row's buttons.
		// Labelled by its text, not by aria-label — matching only the latter picked "Move up".
		const edit = controls.find((b) =>
			/^edit$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim())
		);
		edit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		return edit ? (edit.getAttribute("aria-label") || edit.textContent.trim()) : "(no edit control)";
	}));
	await sleep(2000);

	/** The text input of the setting whose name is `label`, in the topmost modal. */
	const inputFor = (label) => `(function () {
		const modals = Array.from(document.querySelectorAll(".modal"));
		const modal = modals[modals.length - 1];
		const row = Array.from(modal.querySelectorAll(".setting-item")).find(
			(r) => r.querySelector(".setting-item-name")?.textContent.trim() === ${JSON.stringify(label)}
		);
		return row ? row.querySelector("input[type=text], input:not([type])") : null;
	})()`;

	note("modal now", await page.evaluate(() => {
		const modals = Array.from(document.querySelectorAll(".modal"));
		const m = modals[modals.length - 1];
		return {
			title: m?.querySelector(".modal-title, h2, .fileclass-modal-title")?.textContent?.trim(),
			settings: Array.from(m?.querySelectorAll(".setting-item-name") ?? []).map((e) => e.textContent.trim()),
		};
	}));

	note("note path before", await page.evaluate(`${inputFor("Note path")}?.value ?? "(no input)"`));

	// Type the new path the way a person does, so the setting's onChange runs.
	note("typed", await page.evaluate(`(function () {
		const input = ${inputFor("Note path")};
		if (!input) return "(no input)";
		input.value = "Values/New-Rating.md";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		return input.value;
	})()`));
	await sleep(1200);

	note("saved", await page.evaluate(() => {
		const modals = Array.from(document.querySelectorAll(".modal"));
		const m = modals[modals.length - 1];
		const btn = Array.from(m.querySelectorAll("button")).find((b) => /^Save/.test(b.textContent.trim()));
		btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		return btn?.textContent.trim() ?? "(no save button)";
	}));
	await sleep(3000);

	// -- what landed in the class note -----------------------------------------------------------
	note("class note after", await page.evaluate(async () => {
		const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
		const at = yaml.indexOf("plan.erledigt.rating");
		return at < 0 ? "(field gone)" : yaml.slice(at - 12, at + 220);
	}));
	note("open modals left", await page.evaluate(() => document.querySelectorAll(".modal").length));
}
