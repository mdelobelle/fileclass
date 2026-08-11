/*
 * The README's schema-canvas picture, drawn rather than staged (#149).
 *
 *   node demo/probe.mjs 038 demo/schema-shot.mjs
 *
 * Take 038's vault is the one with something to show: eleven classes, one inheritance family
 * with an `excludes`, three kinds of binding claim, two bases and a canvas feeding fields. The
 * script runs the real command, frames the family that carries the story, and writes
 * `docs/static/schema/schema-canvas.png`. Re-run it when the diagram changes shape.
 */
import { mkdirSync } from "node:fs";
const OUT = "/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/fileclass/docs/static/schema";

export default async function ({ page, sleep }) {
	const note = (k, v) => console.log(`· ${k}: ${JSON.stringify(v)}`);
	mkdirSync(OUT, { recursive: true });
	await sleep(2500);
	await page.evaluate(() => window.app.commands.executeCommandById("fileclass:draw-schema-canvas"));
	await sleep(5000);
	note("zoom api", await page.evaluate(() => {
		const c = window.app.workspace.getLeavesOfType("canvas")[0]?.view?.canvas;
		const names = [];
		for (let p = c && Object.getPrototypeOf(c); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) names.push(...Object.getOwnPropertyNames(p));
		return [...new Set(names)].filter((n) => /zoom|select|bbox|fit/i.test(n));
	}));
	// Frame the family that carries the story: Media, its children, their cards, the right column.
	note("framed", await page.evaluate(async () => {
		const c = window.app.workspace.getLeavesOfType("canvas")[0]?.view?.canvas;
		if (!c) return "(no canvas)";
		// The family, its claims and one dependency: enough to say what the canvas is for, and
		// tight enough that nothing is clipped.
		const wanted = new Set([
			"fileclass:Media", "fileclass:Album", "fileclass:Book", "fileclass:Comic", "fileclass:Movie",
			"binding:Album:tags", "binding:Book:paths", "binding:Movie:bookmarks",
			"base:Authors.base",
		]);
		const nodes = Array.from(c.nodes.values()).filter((n) => wanted.has(n.id));
		if (!nodes.length) return "(nothing matched)";
		c.deselectAll?.();
		for (const n of nodes) c.select?.(n);
		c.zoomToSelection?.();
		await new Promise((r) => setTimeout(r, 1200));
		c.deselectAll?.();
		await new Promise((r) => setTimeout(r, 600));
		return { framed: nodes.length, zoom: Math.round((c.zoom ?? 0) * 100) / 100 };
	}));
	await sleep(1500);
	const clip = await page.evaluate(() => {
		const el = window.app.workspace.getLeavesOfType("canvas")[0]?.view?.containerEl?.querySelector(".canvas-wrapper, .canvas");
		if (!el) return null;
		const r = el.getBoundingClientRect();
		// Leave the canvas controls out of the frame.
		return { x: r.left, y: r.top, width: r.width - 90, height: r.height - 40 };
	});
	await page.screenshot({ path: `${OUT}/schema-canvas.png`, ...(clip ? { clip } : {}) });
	note("shot", clip ? `${Math.round(clip.width)}×${Math.round(clip.height)}` : "full window");
}
