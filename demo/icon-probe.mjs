/*
 * Which icon can a view be registered with, and how does each read next to the native table's?
 *
 *   node demo/probe.mjs 901 demo/icon-probe.mjs
 *
 * Obsidian ships one pinned Lucide version, so an icon name is available or it is not — worth
 * asking the app rather than a Lucide changelog. Renders the candidates side by side at the size
 * the view switcher uses.
 */
import { mkdirSync } from "node:fs";
const OUT = "/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/fileclass/demo/.probe-out";

const CANDIDATES = [
	"table",
	"table-2",
	"table-properties",
	"table-cells-merge",
	"sheet",
	"grid-2x2",
	"grid-3x3",
	"list-tree",
	"layout-list",
	"file-spreadsheet",
	"wrench",
	"square-pen",
	"pencil-ruler",
	"text-cursor-input",
];

export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	mkdirSync(OUT, { recursive: true });
	await sleep(3000);

	note("available", await page.evaluate((names) => {
		const { setIcon } = window.require("obsidian");
		const probe = document.createElement("div");
		document.body.appendChild(probe);
		const out = {};
		for (const name of names) {
			probe.empty();
			setIcon(probe, name);
			out[name] = !!probe.querySelector("svg");
		}
		probe.remove();
		return out;
	}, CANDIDATES));

	// Rendered together, at the size the view switcher shows them, on the app's own background.
	await page.evaluate((names) => {
		const { setIcon } = window.require("obsidian");
		const strip = document.body.createDiv();
		strip.setAttribute(
			"style",
			"position:fixed;inset:auto auto 40px 40px;z-index:9999;display:flex;gap:22px;" +
				"padding:18px 22px;background:var(--background-primary);border:1px solid var(--background-modifier-border);" +
				"border-radius:8px;align-items:flex-end"
		);
		strip.id = "fc-icon-strip";
		for (const name of names) {
			const cell = strip.createDiv();
			cell.setAttribute("style", "display:flex;flex-direction:column;align-items:center;gap:8px;width:74px");
			const icon = cell.createDiv();
			setIcon(icon, name);
			icon.setAttribute("style", "color:var(--text-normal)");
			cell.createDiv({ text: name }).setAttribute(
				"style",
				"font-size:9px;color:var(--text-muted);text-align:center;line-height:1.2"
			);
		}
	}, CANDIDATES);
	await sleep(1200);

	const clip = await page.evaluate(() => {
		const r = document.getElementById("fc-icon-strip").getBoundingClientRect();
		return { x: r.left, y: r.top, width: r.width, height: r.height };
	});
	await page.screenshot({ path: `${OUT}/icons.png`, clip });
	note("strip", `${Math.round(clip.width)}×${Math.round(clip.height)}`);
}
