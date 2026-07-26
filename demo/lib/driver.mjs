/*
 * Puppeteer-over-CDP driver for the Obsidian demo recording. Connects to an
 * Obsidian launched with --remote-debugging-port, injects a visible fake cursor
 * and a step-label overlay (the OS cursor doesn't move when driven over CDP),
 * and exposes small, deliberately-paced helpers.
 */
import puppeteer from "puppeteer-core";

const PORT = process.env.OBSIDIAN_CDP_PORT || "9222";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connectObsidian() {
	const browser = await puppeteer.connect({
		browserURL: `http://127.0.0.1:${PORT}`,
		defaultViewport: null,
	});
	const pages = await browser.pages();
	const page = pages.find((p) => p.url().startsWith("app://obsidian.md")) ?? pages[0];
	if (!page) throw new Error("No Obsidian renderer page found on the debug port.");
	await injectOverlay(page);
	return new Driver(browser, page);
}

async function injectOverlay(page) {
	await page.evaluate(() => {
		if (document.getElementById("fc-demo-cursor")) return;
		const cursor = document.createElement("div");
		cursor.id = "fc-demo-cursor";
		const label = document.createElement("div");
		label.id = "fc-demo-label";
		const style = document.createElement("style");
		style.textContent = `
			#fc-demo-cursor{position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;
				border-radius:50%;background:rgba(120,82,238,.35);border:2px solid #7852ee;
				pointer-events:none;transition:transform .05s linear;left:0;top:0}
			#fc-demo-cursor.click{animation:fcPing .4s ease-out}
			@keyframes fcPing{0%{box-shadow:0 0 0 0 rgba(120,82,238,.5)}100%{box-shadow:0 0 0 22px rgba(120,82,238,0)}}
			#fc-demo-label{position:fixed;z-index:99999;left:50%;bottom:38px;transform:translateX(-50%);
				max-width:70vw;padding:10px 18px;border-radius:10px;background:rgba(20,20,28,.9);color:#fff;
				font-size:20px;font-weight:600;pointer-events:none;opacity:0;transition:opacity .25s}
			#fc-demo-label.show{opacity:1}`;
		document.head.appendChild(style);
		document.body.appendChild(cursor);
		document.body.appendChild(label);
	});
}

class Driver {
	constructor(browser, page) {
		this.browser = browser;
		this.page = page;
		this.x = 200;
		this.y = 200;
	}

	async close() {
		this.browser.disconnect();
	}

	/** Sets the caption at the bottom of the screen (empty string hides it). */
	async step(text) {
		await this.page.evaluate((t) => {
			const el = document.getElementById("fc-demo-label");
			if (!el) return;
			el.textContent = t;
			el.classList.toggle("show", !!t);
		}, text);
	}

	async #moveCursor(x, y) {
		await this.page.evaluate(
			(x, y) => {
				const c = document.getElementById("fc-demo-cursor");
				if (c) c.style.transform = `translate(${x}px,${y}px)`;
			},
			x,
			y
		);
	}

	/** Glides the (fake + CDP) cursor to viewport coordinates, easing over steps. */
	async moveTo(x, y, steps = 24) {
		const { x: sx, y: sy } = this;
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			const cx = sx + (x - sx) * ease;
			const cy = sy + (y - sy) * ease;
			await this.#moveCursor(cx, cy);
			await this.page.mouse.move(cx, cy);
			await sleep(12);
		}
		this.x = x;
		this.y = y;
	}

	async clickAt(x, y) {
		await this.moveTo(x, y);
		await this.page.evaluate(() => document.getElementById("fc-demo-cursor")?.classList.add("click"));
		await this.page.mouse.click(x, y);
		await sleep(120);
		await this.page.evaluate(() => document.getElementById("fc-demo-cursor")?.classList.remove("click"));
		await sleep(250);
	}

	/** Waits for `selector` (optionally the Nth / one whose text matches) and clicks its center. */
	async click(selector, { nth = 0, hasText } = {}) {
		await this.page.waitForSelector(selector, { visible: true, timeout: 8000 });
		const box = await this.page.evaluate(
			(sel, nth, hasText) => {
				let els = [...document.querySelectorAll(sel)];
				if (hasText) els = els.filter((e) => e.textContent?.trim() === hasText);
				const el = els[nth];
				if (!el) return null;
				el.scrollIntoView({ block: "center" });
				const r = el.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			},
			selector,
			nth,
			hasText
		);
		if (!box) throw new Error(`No element for ${selector}${hasText ? ` ("${hasText}")` : ""}`);
		await this.clickAt(box.x, box.y);
	}

	async type(text, delay = 55) {
		await this.page.keyboard.type(text, { delay });
		await sleep(300);
	}

	async press(...keys) {
		for (const k of keys) await this.page.keyboard.down(k);
		for (const k of [...keys].reverse()) await this.page.keyboard.up(k);
		await sleep(300);
	}

	/** Runs a plugin/app command by id (silent, reliable). */
	async command(id) {
		await this.page.evaluate((id) => window.app.commands.executeCommandById(id), id);
		await sleep(600);
	}

	/** Opens the command palette and runs `query` visibly (Cmd/Ctrl+P → type → Enter). */
	async palette(query) {
		const mod = process.platform === "darwin" ? "Meta" : "Control";
		await this.press(mod, "p");
		await sleep(400);
		await this.type(query, 45);
		await sleep(500);
		await this.press("Enter");
	}
}
