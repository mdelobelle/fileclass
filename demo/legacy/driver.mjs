/*
 * Puppeteer-over-CDP driver for the Obsidian demo recording. Connects to an
 * Obsidian launched with --remote-debugging-port and injects a step-label
 * overlay at the bottom of the screen.
 *
 * The driver never clicks: mouse clicks are handed off to the operator (purple
 * caption ending in `…`) so they control the pointer's timing, and the driver
 * resumes automatically by watching the DOM (`clickHandoff`/`awaitInPage`). It
 * still drives the keyboard (typing, Enter/Esc) and sets <select>/date values
 * directly. The visible pointer is added later in the screen capture.
 */
import puppeteer from "puppeteer-core";

const PORT = process.env.OBSIDIAN_CDP_PORT || "9222";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connectObsidian() {
	const browser = await puppeteer.connect({
		browserURL: `http://127.0.0.1:${PORT}`,
		defaultViewport: null,
	});
	// The main window is the page exposing window.app (settings may live in a
	// separate window whose URL is about:blank, so match by app, not by URL).
	let appPage = null;
	for (const p of await browser.pages()) {
		if (await p.evaluate(() => !!window.app).catch(() => false)) {
			appPage = p;
			break;
		}
	}
	if (!appPage) throw new Error("No Obsidian renderer page (window.app) on the debug port.");
	await injectOverlay(appPage);
	return new Driver(browser, appPage);
}

async function injectOverlay(page) {
	await page.evaluate(() => {
		if (document.getElementById("fc-demo-label")) return;
		const label = document.createElement("div");
		label.id = "fc-demo-label";
		const style = document.createElement("style");
		style.textContent = `
			#fc-demo-label{position:fixed;z-index:99999;left:50%;bottom:38px;transform:translateX(-50%);
				max-width:70vw;padding:10px 18px;border-radius:10px;background:rgba(20,20,28,.9);color:#fff;
				font-size:20px;font-weight:600;pointer-events:none;opacity:0;transition:opacity .25s}
			#fc-demo-label.show{opacity:1}
			#fc-demo-label.handoff{background:rgba(120,82,238,.95);box-shadow:0 0 0 3px rgba(120,82,238,.35)}`;
		document.head.appendChild(style);
		document.body.appendChild(label);
	});
}

class Driver {
	constructor(browser, appPage) {
		this.browser = browser;
		this.appPage = appPage; // the window.app page (for commands/eval)
		this.page = appPage; // the active page for UI interactions
		this.x = 200;
		this.y = 200;
	}

	async close() {
		this.browser.disconnect();
	}

	/**
	 * Switches UI interactions to whichever window's document contains `selector`.
	 * This Obsidian build opens settings, the plugin browser, etc. as SEPARATE
	 * windows, so we follow the DOM rather than assume a single page.
	 */
	async useWindowWith(selector, { timeout = 8000 } = {}) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			for (const p of await this.browser.pages()) {
				const has = await p
					.evaluate((s) => document.querySelector(s) != null, selector)
					.catch(() => false);
				if (has) {
					await injectOverlay(p);
					this.page = p;
					this.x = this.y = 120;
					return;
				}
			}
			await sleep(200);
		}
		throw new Error(`No window contains "${selector}"`);
	}

	/** Convenience: switch to the settings window. */
	async useSettingsWindow(opts) {
		return this.useWindowWith(".mod-settings", opts);
	}

	/** Switches UI interactions back to the main app window. */
	useMainWindow() {
		this.page = this.appPage;
		this.x = this.y = 200;
	}

	/** Sets the caption at the bottom of the screen (empty string hides it). */
	async step(text) {
		this._handoffActive = false;
		await this.page.evaluate((t) => {
			const el = document.getElementById("fc-demo-label");
			if (!el) return;
			el.textContent = t;
			el.classList.remove("handoff");
			el.classList.toggle("show", !!t);
		}, text);
	}

	/**
	 * Shows a "your turn" caption (accent style + trailing `…`) for actions the
	 * CDP driver can't perform — notably the file context menu, which this
	 * Obsidian build renders in a separate window unreachable over the debug
	 * port. Pair with `awaitInPage()` to detect when you've done the click and
	 * resume automatically. Caption is set on the app (main) window so it stays
	 * visible while you interact with the popped-out menu.
	 */
	async handoff(text) {
		this._handoffActive = true;
		await this.appPage.evaluate((t) => {
			const el = document.getElementById("fc-demo-label");
			if (!el) return;
			el.textContent = `${t}   …`;
			el.classList.add("show", "handoff");
		}, text);
	}

	/** Hides the caption (used to clear a handoff the instant it's satisfied). */
	async clearCaption() {
		this._handoffActive = false;
		await this.appPage.evaluate(() => {
			const el = document.getElementById("fc-demo-label");
			if (el) el.classList.remove("show", "handoff");
		});
	}

	/**
	 * Polls a predicate in the main window until it returns truthy (or times
	 * out). Used to detect the result of a manual click — a modal appearing, or
	 * frontmatter gaining fields — so the scenario can continue hands-free. When
	 * a handoff caption is showing, it's cleared the instant the click lands (so
	 * the purple prompt disappears as soon as you act).
	 */
	async awaitInPage(fn, { timeout = 180000, poll = 250, args = [] } = {}) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const ok = await this.appPage.evaluate(fn, ...args).catch(() => false);
			if (ok) {
				if (this._handoffActive) await this.clearCaption();
				return;
			}
			await sleep(poll);
		}
		throw new Error("Timed out waiting for the manual click (no DOM change detected).");
	}

	/**
	 * Sets the caption and waits for your click to take effect. Pairs a purple
	 * `…` handoff with a DOM predicate — the one primitive the scenario uses for
	 * every mouse click (buttons, pencils, palette rows, menu items, options).
	 */
	async clickHandoff(caption, detect, opts = {}) {
		await this.handoff(caption);
		await this.awaitInPage(detect, opts);
	}

	/** Focuses an input in the active window (no mouse) and types into it. */
	async fill(selector, text, { modal = false, clear = true, nth = 0 } = {}) {
		await this.page.waitForSelector(selector, { visible: true, timeout: 8000 }).catch(() => {});
		const found = await this.page.evaluate(
			(sel, nth, modal) => {
				const modals = [...document.querySelectorAll(".modal")];
				const root = modal && modals.length ? modals[modals.length - 1] : document;
				const el = [...root.querySelectorAll(sel)].at(nth); // negative nth = from end
				if (!el) return false;
				el.scrollIntoView({ block: "center" });
				el.focus();
				return true;
			},
			selector,
			nth,
			modal
		);
		if (!found) throw new Error(`No input for ${selector}`);
		if (clear) await this.press(process.platform === "darwin" ? "Meta" : "Control", "a");
		await this.type(text);
	}

	/** Focuses the input in the modal's setting row whose name equals `label`. */
	async fillSetting(label, text, { clear = true } = {}) {
		const found = await this.page.evaluate((label) => {
			const modals = [...document.querySelectorAll(".modal")];
			const root = modals[modals.length - 1] ?? document;
			const item = [...root.querySelectorAll(".setting-item")].find(
				(s) => s.querySelector(".setting-item-name")?.textContent?.trim() === label
			);
			const el = item?.querySelector("input[type='text'], input:not([type])");
			if (!el) return false;
			el.scrollIntoView({ block: "center" });
			el.focus();
			return true;
		}, label);
		if (!found) throw new Error(`No setting input for "${label}"`);
		if (clear) await this.press(process.platform === "darwin" ? "Meta" : "Control", "a");
		await this.type(text);
		await this.appPage.evaluate(() => document.activeElement?.blur()); // close any suggest popover
		await sleep(150);
	}

	/** Sets a <select>'s value and fires change (reliable vs. option clicking). */
	async select(value, { selector = "select", modal = true } = {}) {
		await this.page.evaluate(
			(sel, value, modal) => {
				const modals = [...document.querySelectorAll(".modal")];
				const root = modal && modals.length ? modals[modals.length - 1] : document;
				const el = root.querySelector(sel);
				if (!el) return;
				el.value = value;
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			selector,
			value,
			modal
		);
		await sleep(120);
	}

	/** Sets an input's value directly and fires input+change (dates, etc.). */
	async setValue(selector, value, { modal = true } = {}) {
		await this.page.evaluate(
			(sel, value, modal) => {
				const modals = [...document.querySelectorAll(".modal")];
				const root = modal && modals.length ? modals[modals.length - 1] : document;
				const el = root.querySelector(sel);
				if (!el) return;
				el.value = value;
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			selector,
			value,
			modal
		);
		await sleep(300);
	}

	/** Runs arbitrary code in the Obsidian renderer (setup shortcuts). App window. */
	async eval(fn, ...args) {
		return this.appPage.evaluate(fn, ...args);
	}

	/** { name, path } of the vault currently open in the connected Obsidian. */
	async vault() {
		return this.appPage.evaluate(() => ({
			name: window.app.vault.getName(),
			path: window.app.vault.adapter?.getBasePath?.() ?? "",
		}));
	}

	/**
	 * Safety gate: refuse to drive unless the connected vault matches `expected`
	 * (name or path substring). Prevents scripted actions hitting a real vault.
	 */
	async assertVault(expected) {
		const v = await this.vault();
		const ok = v.name === expected || v.path.includes(expected);
		console.log(`Connected vault: "${v.name}" (${v.path})`);
		if (!ok) {
			throw new Error(
				`Refusing to run: connected vault "${v.name}" does not match "${expected}". ` +
					`Open the demo vault in the debugged Obsidian (or set FILECLASS_DEMO_VAULT).`
			);
		}
	}

	async type(text, delay = 28) {
		await this.page.keyboard.type(text, { delay });
		await sleep(90);
	}

	async press(...keys) {
		for (const k of keys) await this.page.keyboard.down(k);
		for (const k of [...keys].reverse()) await this.page.keyboard.up(k);
		await sleep(110);
	}

	/** Runs a plugin/app command by id (silent, reliable). Always on the app window. */
	async command(id) {
		await this.appPage.evaluate((id) => window.app.commands.executeCommandById(id), id);
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

	/** Opens the command palette and types `query` (leaving the list shown to click). */
	async openPalette(query) {
		const mod = process.platform === "darwin" ? "Meta" : "Control";
		await this.press(mod, "p");
		await sleep(500);
		await this.type(query, 50);
		await sleep(700);
	}
}
