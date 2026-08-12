/*
 * #159, the reporter's exact gesture: pick the path from the **suggestion popup** rather than
 * typing it, then leave the modal two different ways.
 *
 *   node demo/probe.mjs 901 demo/select-notepath-suggest.mjs
 *
 * Typing the path and pressing Save is already known to work (select-notepath-probe.mjs). What is
 * asked here: does accepting a suggestion carry into the draft, and what happens to it if the modal
 * is dismissed instead of saved — "I always accepted the pop up with the right address. But it
 * wasn't stored."
 */
export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	await sleep(3000);

	const setup = () =>
		page.evaluate(async () => {
			const v = window.app.vault;
			await v.createFolder("Values").catch(() => {});
			for (const [p, b] of [
				["Values/Old-Rating.md", "one\ntwo\n"],
				["Values/New-Rating.md", "alpha\nbeta\n"],
			]) {
				if (!v.getAbstractFileByPath(p)) await v.create(p, b);
			}
			const cls = v.getAbstractFileByPath("Classes/Book.md");
			const yaml = await v.read(cls);
			const block =
				"  - name: plan.erledigt.rating\n    id: Y9fhcD\n    type: Select\n    options:\n" +
				"      sourceType: ValuesListNotePath\n      valuesListNotePath: Values/Old-Rating.md\n" +
				'      required: true\n    path: ""\n';
			await v.modify(
				cls,
				yaml.includes("plan.erledigt.rating")
					? yaml.replace(/valuesListNotePath: Values\/[\w-]+\.md/, "valuesListNotePath: Values/Old-Rating.md")
					: yaml.replace("fields:\n", `fields:\n${block}`)
			);
			return (await v.read(cls)).match(/valuesListNotePath: (\S+)/)[1];
		});

	const openFieldEditor = async () => {
		await page.evaluate(() => window.app.commands.executeCommandById("fileclass:edit-class-schema"));
		await sleep(2200);
		await page.evaluate(() => {
			const row = Array.from(document.querySelectorAll(".modal .setting-item")).find(
				(r) => r.querySelector(".setting-item-name")?.textContent.trim() === "plan.erledigt.rating"
			);
			Array.from(row?.querySelectorAll("button, .clickable-icon") ?? [])
				.find((b) => /^edit$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()))
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		await sleep(2000);
	};

	/** Types a partial path and clicks the suggestion, the way the reporter did. */
	const pickFromPopup = async (partial) => {
		const typed = await page.evaluate((q) => {
			const modal = Array.from(document.querySelectorAll(".modal")).pop();
			const row = Array.from(modal.querySelectorAll(".setting-item")).find(
				(r) => r.querySelector(".setting-item-name")?.textContent.trim() === "Note path"
			);
			const input = row?.querySelector("input");
			if (!input) return "(no input)";
			input.focus();
			input.value = q;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			return input.value;
		}, partial);
		await sleep(1200);
		const picked = await page.evaluate(() => {
			const items = Array.from(document.querySelectorAll(".suggestion-item"));
			const hit = items.find((e) => e.textContent.includes("New-Rating"));
			if (!hit) return `(no suggestion — ${items.length} shown)`;
			// A suggestion is taken on mousedown, before the input loses focus.
			for (const type of ["mousedown", "mouseup", "click"]) {
				hit.dispatchEvent(new MouseEvent(type, { bubbles: true }));
			}
			return hit.textContent.trim();
		});
		await sleep(1000);
		const inInput = await page.evaluate(() => {
			const modal = Array.from(document.querySelectorAll(".modal")).pop();
			const row = Array.from(modal.querySelectorAll(".setting-item")).find(
				(r) => r.querySelector(".setting-item-name")?.textContent.trim() === "Note path"
			);
			return row?.querySelector("input")?.value ?? "(gone)";
		});
		return { typed, picked, inInput };
	};

	const stored = () =>
		page.evaluate(async () => {
			const yaml = await window.app.vault.read(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
			return yaml.match(/valuesListNotePath: (\S+)/)?.[1] ?? "(none)";
		});

	// -- A. suggestion, then Save ----------------------------------------------------------------
	note("A · stored before", await setup());
	await sleep(1500);
	await openFieldEditor();
	note("A · popup", await pickFromPopup("New-"));
	await page.evaluate(() => {
		const modal = Array.from(document.querySelectorAll(".modal")).pop();
		Array.from(modal.querySelectorAll("button"))
			.find((b) => /^Save/.test(b.textContent.trim()))
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(2500);
	note("A · stored after Save", await stored());
	await page.evaluate(() => Array.from(document.querySelectorAll(".modal-close-button")).pop()?.click());
	await sleep(1500);

	// -- B. suggestion, then dismiss the modal without saving ------------------------------------
	note("B · stored before", await setup());
	await sleep(1500);
	await openFieldEditor();
	note("B · popup", await pickFromPopup("New-"));
	note("B · dismissed with Escape", await page.evaluate(() => {
		const modal = Array.from(document.querySelectorAll(".modal")).pop();
		modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		return true;
	}));
	await sleep(1500);
	note("B · what is on screen", await page.evaluate(() => {
		const modal = Array.from(document.querySelectorAll(".modal")).pop();
		return modal
			? {
					text: modal.textContent.trim().slice(0, 120),
					buttons: Array.from(modal.querySelectorAll("button")).map((b) => b.textContent.trim()),
			  }
			: "(no modal)";
	}));
	note("B · stored", await stored());
}
