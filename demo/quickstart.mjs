/* The five quickstart screenshots, replayed rather than remembered. */
import { mkdirSync } from "node:fs";

const OUT = "/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/fileclass/docs/static/quickstart";

export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	mkdirSync(OUT, { recursive: true });
	const shot = async (name, sel) => {
		const clip = sel
			? await page.evaluate(`(() => {
					const el = document.querySelector(${JSON.stringify(sel)});
					if (!el) return null;
					const r = el.getBoundingClientRect();
					const pad = 18;
					return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: r.width + pad * 2, height: r.height + pad * 2 };
				})()`)
			: null;
		await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
		note(name, clip ? `${Math.round(clip.width)}×${Math.round(clip.height)}` : "full window");
	};

	// 1 — the setting that has to come first.
	await page.evaluate(() => window.app.setting.open());
	await sleep(1200);
	await page.evaluate(() => {
		const tab = Array.from(document.querySelectorAll(".vertical-tab-nav-item")).find((t) => /Fileclass/i.test(t.textContent));
		tab?.click();
	});
	await sleep(1500);
	await page.evaluate(() => {
		const row = Array.from(document.querySelectorAll(".setting-item")).find((s) => /Class files folder/i.test(s.querySelector(".setting-item-name")?.textContent ?? ""));
		const input = row?.querySelector("input");
		if (input) { input.value = "Classes"; input.dispatchEvent(new Event("input", { bubbles: true })); }
		row?.scrollIntoView({ block: "center" });
	});
	await sleep(1200);
	await shot("01-class-folder", ".vertical-tab-content-container");
	await page.evaluate(() => window.app.setting.close());
	await sleep(900);

	// 2 — a class with one Select field.
	await page.evaluate(() => window.app.commands.executeCommandById(Object.values(window.app.commands.commands).find((c) => /create a class/i.test(c.name)).id));
	await sleep(1400);
	note("create asks", await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal, .prompt")).pop();
		return { cls: m?.className, title: m?.querySelector(".fileclass-modal-title")?.textContent?.trim(), inputs: m?.querySelectorAll("input").length };
	}));
	await page.evaluate(() => {
		const m = Array.from(document.querySelectorAll(".modal, .prompt")).pop();
		const input = m?.querySelector("input");
		if (input) { input.value = "Book"; input.dispatchEvent(new Event("input", { bubbles: true })); }
	});
	await sleep(700);
	await page.keyboard.press("Enter");
	await sleep(2600);
	note("after creating", await page.evaluate(() => ({
		classes: window.app.plugins.plugins.fileclass.index.fileClassNames,
		modal: Array.from(document.querySelectorAll(".modal")).pop()?.querySelector(".fileclass-modal-title")?.textContent?.trim() ?? null,
	})));
}
