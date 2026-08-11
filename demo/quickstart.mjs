/*
 * The screenshots behind the README's written quickstart (#92).
 *
 *   node demo/probe.mjs 900 demo/quickstart.mjs
 *
 * Replayed rather than remembered: when the UI moves, run it again and the four PNGs in
 * `docs/static/quickstart/` move with it. The README references them by absolute
 * raw.githubusercontent URL, because the community store breaks relative image paths.
 *
 * Step 1 of the written quickstart — the *Class files folder* setting — has no screenshot: the
 * settings window cannot be opened from this harness (`app:open-settings` returns, no modal
 * renders), and every Obsidian user knows where the settings live. The text quotes the notice
 * you get if you skip it instead, which is the more useful thing to recognise.
 */
import { mkdirSync } from "node:fs";

const OUT = "/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/fileclass/docs/static/quickstart";

export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	mkdirSync(OUT, { recursive: true });
	const shot = async (name, sel, pad = 20) => {
		const clip = await page.evaluate(`(() => {
			const el = document.querySelector(${JSON.stringify(sel)});
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: Math.max(0, r.left - ${pad}), y: Math.max(0, r.top - ${pad}), width: Math.min(r.width + ${pad} * 2, window.innerWidth), height: r.height + ${pad} * 2 };
		})()`);
		if (!clip) throw new Error(`${name}: nothing matches ${sel}`);
		await page.screenshot({ path: `${OUT}/${name}.png`, clip });
		note(name, `${Math.round(clip.width)}×${Math.round(clip.height)}`);
	};
	const modal = () => page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		return m?.querySelector(".fileclass-modal-title")?.textContent?.trim() ?? null;
	});

	// The setting step 1 describes, applied here so the rest can happen at all.
	await page.evaluate(async () => {
		const p = window.app.plugins.plugins.fileclass;
		p.settings.classFilesPath = "Classes/";
		await p.saveSettings();
	});
	await sleep(1000);

	// 2 — a class with one Select field, three values.
	await page.evaluate(() => window.app.commands.executeCommandById(Object.values(window.app.commands.commands).find((c) => /create a class/i.test(c.name)).id));
	await sleep(1500);
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		const input = m.querySelector("input");
		input.value = "Book";
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await sleep(600);
	await page.keyboard.press("Enter");
	await sleep(2600);
	note("created", await page.evaluate(() => window.app.plugins.plugins.fileclass.index.fileClassNames));
	note("and opened", await modal());

	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		Array.from(m.querySelectorAll("button")).find((b) => /add field/i.test(b.textContent))?.click();
	});
	await sleep(1500);
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		const name = m.querySelector("input");
		name.value = "status";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		const type = Array.from(m.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.value === "Select"));
		type.value = "Select";
		type.dispatchEvent(new Event("change", { bubbles: true }));
	});
	await sleep(1400);
	// Three values, typed into the rows the "Add value" button creates.
	for (const value of ["Reading", "Read", "Abandoned"]) {
		await page.evaluate(() => {
			const m = Array.from(document.querySelectorAll(".modal")).pop();
			Array.from(m.querySelectorAll("button")).find((b) => /add value/i.test(b.textContent))?.click();
		});
		await sleep(700);
		await page.evaluate(`(() => {
			const m = Array.from(document.querySelectorAll(".modal")).pop();
			const inputs = Array.from(m.querySelectorAll("input[type=text], input:not([type])"));
			const last = inputs[inputs.length - 1];
			last.value = ${JSON.stringify(value)};
			last.dispatchEvent(new Event("input", { bubbles: true }));
		})()`);
		await sleep(500);
	}
	note("the field being added", await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		return Array.from(m.querySelectorAll("input")).map((i) => i.value).filter(Boolean);
	}));
	await shot("02-select-field", ".modal-container:last-child .modal");

	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		Array.from(m.querySelectorAll("button")).find((b) => /^save/i.test(b.textContent.trim()))?.click();
	});
	await sleep(2500);
	note("Book's fields", await page.evaluate(() =>
		window.app.plugins.plugins.fileclass.index.getResolvedFields("Book").map((f) => `${f.name}:${f.type}`)));
	await page.keyboard.press("Escape");
	await sleep(900);

	// 3 — bind a note, the property way.
	await page.evaluate(async () => {
		await window.app.workspace.getLeaf(false).openFile(window.app.vault.getAbstractFileByPath("Books/Dune.md"));
	});
	await sleep(1800);
	await page.evaluate(() => window.app.commands.executeCommandById(Object.values(window.app.commands.commands).find((c) => /add a class to this note/i.test(c.name)).id));
	await sleep(1500);
	await page.evaluate(() => {
		const p = Array.from(document.querySelectorAll(".prompt, .modal")).pop();
		Array.from(p.querySelectorAll(".suggestion-item")).find((i) => i.textContent.trim() === "Book")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(2600);
	note("Dune's frontmatter", await page.evaluate(() =>
		window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Books/Dune.md"))?.frontmatter));
	await shot("03-bind-note", ".workspace-leaf.mod-active .metadata-container");

	// 4 — bind a folder instead: the class's own options.
	await page.evaluate(async () => {
		await window.app.workspace.getLeaf(false).openFile(window.app.vault.getAbstractFileByPath("Classes/Book.md"));
	});
	await sleep(1800);
	await page.evaluate(() => {
		const w = document.querySelector(".fileclass-prop-actions");
		Array.from(w?.querySelectorAll(".fileclass-prop-action") ?? []).find((b) => /Options/.test(b.textContent))?.click();
	});
	await sleep(1800);
	note("options modal", await modal());
	// *Files paths* is a picker, not a text box (#121): Choose… opens the vault's folders.
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		const row = Array.from(m.querySelectorAll(".setting-item")).find((s) => /Files paths/i.test(s.querySelector(".setting-item-name")?.textContent ?? ""));
		Array.from(row?.querySelectorAll("button") ?? []).find((b) => /choose/i.test(b.textContent))?.click();
	});
	await sleep(1600);
	note("the folder picker", await modal());
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		const row = Array.from(m.querySelectorAll(".fileclass-toggle-row, .setting-item")).find((r) => /^Books$/.test(r.querySelector(".setting-item-name")?.textContent?.trim() ?? ""));
		const toggle = row?.querySelector(".checkbox-container, input[type=checkbox], .checkbox-container input");
		(toggle ?? row)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(1000);
	await shot("04-bind-folder", ".modal-container:last-child .modal");
	note("picker buttons", await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		return Array.from(m.querySelectorAll("button")).map((b) => b.textContent.trim());
	}));
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		Array.from(m.querySelectorAll("button")).find((b) => /^(save|done|ok|apply)/i.test(b.textContent.trim()))?.click();
	});
	await sleep(1500);
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		Array.from(m.querySelectorAll("button")).find((b) => /^save/i.test(b.textContent.trim()))?.click();
	});
	await sleep(2500);
	note("who carries Book now", await page.evaluate(() => {
		const app = window.app, p = app.plugins.plugins.fileclass;
		return app.vault.getMarkdownFiles().filter((f) => p.index.getFileClasses(f).includes("Book")).map((f) => f.path).sort();
	}));

	// 5 — fill it where the row already exists: binding by property inserted the fields.
	await page.evaluate(async () => {
		await window.app.workspace.getLeaf(false).openFile(window.app.vault.getAbstractFileByPath("Books/Dune.md"));
	});
	await sleep(2200);
	await page.evaluate(() => {
		const row = Array.from(document.querySelectorAll(".metadata-property")).find((r) => r.dataset.propertyKey === "status");
		row?.querySelector(".fileclass-prop-edit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(1800);
	note("the picker offers", await page.evaluate(() => {
		const p = Array.from(document.querySelectorAll(".prompt, .modal")).pop();
		return Array.from(p?.querySelectorAll(".suggestion-item") ?? []).map((i) => i.textContent.trim());
	}));
	await shot("05-fill-value", ".prompt", 12);
	await page.evaluate(() => {
		const p = Array.from(document.querySelectorAll(".prompt")).pop();
		Array.from(p.querySelectorAll(".suggestion-item")).find((i) => /Reading/.test(i.textContent))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await sleep(2400);
	note("Dune after", await page.evaluate(() =>
		window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Books/Dune.md"))?.frontmatter));

	// 6 — and on a note the folder claims, where no frontmatter exists yet: the fields modal
	// still knows the field, and writing it is what creates the key.
	await page.evaluate(async () => {
		await window.app.workspace.getLeaf(false).openFile(window.app.vault.getAbstractFileByPath("Books/Foundation.md"));
	});
	await sleep(2000);
	note("Foundation's frontmatter", await page.evaluate(() =>
		window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Books/Foundation.md"))?.frontmatter ?? "(none at all)"));
	await page.evaluate(() => window.app.commands.executeCommandById(Object.values(window.app.commands.commands).find((c) => /manage note fields/i.test(c.name)).id));
	await sleep(1900);
	note("the fields modal", await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal")).pop();
		return {
			title: m?.querySelector(".fileclass-modal-title")?.textContent?.trim(),
			fields: Array.from(m?.querySelectorAll(".fileclass-field-row .setting-item-name") ?? []).map((n) => n.textContent.trim()),
			footer: Array.from(m?.querySelectorAll("button") ?? []).map((b) => b.textContent.trim()),
		};
	}));
	await shot("06-fields-modal", ".modal-container:last-child .modal");
}
