/*
 * Subtitles + cue: the only thing the driver does inside Obsidian.
 *
 * It injects two things into every Obsidian renderer window (this build opens
 * settings and the plugin browser as SEPARATE windows, so "every window" is not
 * optional):
 *   1. a caption bar at the bottom — the narration the viewer reads;
 *   2. a capture-phase keydown listener bumping a counter when the cue chord is
 *      pressed, so the operator can advance the script while Obsidian, not the
 *      terminal, has focus;
 *   3. a key badge under the caption showing the special keys being pressed —
 *      ⏎, ⌥⏎, ⇥ — so a keyboard gesture is visible in the recording. Typed text
 *      never appears: the viewer reads the value in the field, and a keylogger
 *      strip would be noise. Rendered in-page, so there is no round trip between
 *      the keypress and the pixels.
 *
 * Installed everywhere, shown in ONE place: the caption is painted only on the
 * focused window and blanked on the others, else opening settings puts a second
 * copy on screen. Focus is polled while waiting for the cue, so the caption
 * follows the window the operator is actually working in.
 *
 * No clicking, typing or DOM poking beyond that: the whole demo is performed by
 * a human, at human speed. That's the point.
 */
import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cmd+Ctrl+Option+Shift+C — four modifiers, so nothing else claims it. */
const CUE_CODE = process.env.FILECLASS_DEMO_CUE || "KeyC";
export const CUE_LABEL = `⌘⌃⌥⇧${CUE_CODE.replace(/^Key/, "")}`;
/** Same modifiers, U: lifts the caption to the top of the screen and back. */
export const LIFT_LABEL = "⌘⌃⌥⇧U";

/** `showKeys: false` records without the key badge (see Stage.showKeys). */
export async function connect(port, { showKeys = true } = {}) {
	const browser = await puppeteer.connect({
		browserURL: `http://127.0.0.1:${port}`,
		defaultViewport: null,
	});
	const stage = new Stage(browser, { showKeys });
	await stage.refresh();
	return stage;
}

/** Injected in each window: caption element + cue listener. Idempotent. */
function install(cueCode) {
	const LIFT_CODE = "KeyU";
	/** Puts the caption (and the key badge under it) at the top or the bottom. */
	const applyPlacement = () => {
		const top = !!window.__fcDemo?.top;
		for (const id of ["fc-demo-subtitle", "fc-demo-keys"]) {
			document.getElementById(id)?.classList.toggle("fc-top", top);
		}
	};
	window.__fcApplyPlacement = applyPlacement;

	if (!window.__fcDemo) {
		window.__fcDemo = { cue: 0 };
		window.addEventListener(
			"keydown",
			(e) => {
				if (!(e.metaKey && e.ctrlKey && e.altKey && e.shiftKey)) return;
				if (e.code === window.__fcDemo.code) {
					e.preventDefault();
					e.stopPropagation();
					window.__fcDemo.cue++;
					return;
				}
				// Same chord, U: lift the caption out of the way of whatever it covers
				// — a setting at the bottom of a pane, a picker's own controls. Press
				// again to drop it back, and the next subtitle starts at the bottom.
				if (e.code === LIFT_CODE) {
					e.preventDefault();
					e.stopPropagation();
					window.__fcDemo.top = !window.__fcDemo.top;
					applyPlacement();
				}
			},
			true
		);
	}
	window.__fcDemo.code = cueCode;

	if (!window.__fcKeys) {
		/*
		 * Which chords to show, and which to keep quiet:
		 *  - typed text is invisible (a bare letter, digit or punctuation);
		 *  - a named key (Enter, Tab, Escape, an arrow) always shows;
		 *  - anything held with ⌘/⌃/⌥ shows, letter included (⌘S);
		 *  - a modifier held ALONE shows after a beat — that's the Alt-click reveal,
		 *    and the beat is what keeps the cue chord's four modifiers from
		 *    flashing on screen as the operator rolls them;
		 *  - the cue chord shows nothing and clears whatever is up: it is the
		 *    operator's private signal, not part of the demo.
		 */
		const GLYPHS = {
			Enter: "⏎", Tab: "⇥", Escape: "⎋", Backspace: "⌫", Delete: "⌦",
			ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
			Home: "↖", End: "↘", PageUp: "⇞", PageDown: "⇟", " ": "Space",
		};
		const MODIFIER_KEYS = ["Meta", "Control", "Alt", "Shift", "CapsLock"];
		const state = { chord: "", count: 0, hideAt: 0, pending: 0, timer: 0 };

		const chordOf = (e) => {
			const mods =
				(e.metaKey ? "⌘" : "") + (e.ctrlKey ? "⌃" : "") + (e.altKey ? "⌥" : "") +
				(e.shiftKey ? "⇧" : "");
			if (MODIFIER_KEYS.includes(e.key)) return { label: mods, alone: true };
			const named = e.key in GLYPHS || e.key.length > 1;
			// Shift is not a "real" modifier here: ⇧a is just A.
			const real = e.metaKey || e.ctrlKey || e.altKey;
			if (!named && !real) return null;
			const glyph = GLYPHS[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
			return { label: mods + glyph, alone: false };
		};

		const badge = () => document.getElementById("fc-demo-keys");
		const clear = () => {
			window.clearTimeout(state.pending);
			state.pending = 0;
			state.chord = "";
			state.count = 0;
			badge()?.classList.remove("fc-show");
		};
		const render = (label) => {
			const el = badge();
			if (!el) return;
			state.count = label === state.chord ? state.count + 1 : 1;
			state.chord = label;
			el.textContent = state.count > 1 ? `${label} ×${state.count}` : label;
			el.classList.add("fc-show");
			window.clearTimeout(state.timer);
			// Long enough to read at 1× and to bridge a quick Enter–Enter chain.
			state.timer = window.setTimeout(clear, 1600);
		};

		window.__fcKeys = { clear, enabled: true };
		window.addEventListener(
			"keydown",
			(e) => {
				if (!window.__fcKeys.enabled || e.repeat) return;
				const isOperatorChord =
					(e.code === window.__fcDemo?.code || e.code === LIFT_CODE) &&
					e.metaKey && e.ctrlKey && e.altKey && e.shiftKey;
				if (isOperatorChord) return clear();
				const chord = chordOf(e);
				if (!chord) return;
				window.clearTimeout(state.pending);
				if (chord.alone) {
					// Deliberate hold, not a chord being assembled.
					state.pending = window.setTimeout(() => render(chord.label), 260);
					return;
				}
				render(chord.label);
			},
			true
		);
	}

	if (!document.getElementById("fc-demo-subtitle")) {
		const style = document.createElement("style");
		style.id = "fc-demo-subtitle-style";
		style.textContent = `
			#fc-demo-subtitle{position:fixed;z-index:2147483647;left:50%;bottom:6vh;
				transform:translateX(-50%) translateY(6px);max-width:72vw;box-sizing:border-box;
				padding:14px 26px;border-radius:14px;background:rgba(14,14,20,.86);
				-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
				border:1px solid rgba(255,255,255,.08);box-shadow:0 12px 40px rgba(0,0,0,.45);
				color:#fff;font-size:23px;line-height:1.35;font-weight:550;text-align:center;
				text-wrap:balance;letter-spacing:.2px;pointer-events:none;user-select:none;
				opacity:0;transition:opacity .3s ease,transform .3s ease}
			#fc-demo-subtitle.fc-show{opacity:1;transform:translateX(-50%) translateY(0)}
			#fc-demo-subtitle.fc-title{font-size:34px;padding:20px 34px;bottom:auto;top:50%;
				transform:translate(-50%,-50%)}
			#fc-demo-subtitle.fc-title.fc-show{transform:translate(-50%,-50%)}
			#fc-demo-keys{position:fixed;z-index:2147483647;left:50%;bottom:2vh;
				transform:translateX(-50%) translateY(4px);padding:6px 16px;border-radius:10px;
				background:rgba(14,14,20,.78);-webkit-backdrop-filter:blur(10px);
				backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.10);
				color:#fff;font-size:19px;line-height:1.2;font-weight:600;letter-spacing:1.5px;
				font-family:-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none;
				user-select:none;opacity:0;transition:opacity .16s ease,transform .16s ease}
			#fc-demo-keys.fc-show{opacity:1;transform:translateX(-50%) translateY(0)}
			#fc-demo-subtitle.fc-top:not(.fc-title){bottom:auto;top:6vh}
			#fc-demo-keys.fc-top{bottom:auto;top:2vh}`;
		document.head.appendChild(style);
		const el = document.createElement("div");
		el.id = "fc-demo-subtitle";
		document.body.appendChild(el);
		const keys = document.createElement("div");
		keys.id = "fc-demo-keys";
		document.body.appendChild(keys);
	}
}

class Stage {
	constructor(browser, { showKeys = true } = {}) {
		this.browser = browser;
		/** Show the special keys being pressed under the caption. */
		this.showKeys = showKeys;
		this.pages = [];
		this.appPage = null;
		this.cues = new Map(); // page → last seen counter
		this.seen = new Map(); // page → order of appearance (newest window wins ties)
		this.seq = 0;
		this.focused = null; // the ONE window currently showing the caption
		this.caption = { text: "", title: false };
	}

	/**
	 * Rescans the debug target list, (re)injecting into any window that lost the
	 * overlay — new settings windows, or a renderer that reloaded.
	 */
	async refresh() {
		const pages = [];
		for (const page of await this.browser.pages()) {
			if (page.isClosed()) continue;
			const ok = await page
				.evaluate(install, CUE_CODE)
				.then(() => true)
				.catch(() => false);
			if (!ok) continue;
			pages.push(page);
			if (!this.cues.has(page)) this.cues.set(page, 0);
			if (!this.seen.has(page)) this.seen.set(page, ++this.seq);
			if (!this.appPage || this.appPage.isClosed()) {
				const isApp = await page.evaluate(() => !!window.app).catch(() => false);
				if (isApp) this.appPage = page;
			}
		}
		this.pages = pages;
		for (const map of [this.cues, this.seen]) {
			for (const page of [...map.keys()]) if (!pages.includes(page)) map.delete(page);
		}
		await this.syncFocus(); // a window that just opened may own the caption now
		return pages.length;
	}

	/**
	 * The window the caption belongs on: the focused one. This build opens
	 * settings and the plugin browser as separate windows that overlap the main
	 * one, so painting everywhere showed the subtitle twice. If several claim
	 * focus (Electron sometimes keeps the parent focused too) the newest window
	 * wins — it's the one on top; if none does (the terminal has focus), whatever
	 * held it keeps it.
	 */
	async pickFocused() {
		const claims = [];
		for (const page of this.pages) {
			// A hidden or empty renderer can report focus; painting there would put
			// the caption on a window nobody sees.
			const has = await page
				.evaluate(
					() =>
						document.hasFocus() &&
						document.visibilityState === "visible" &&
						document.body.childElementCount > 0
				)
				.catch(() => false);
			if (has) claims.push(page);
		}
		if (claims.length) return claims.sort((a, b) => this.seen.get(b) - this.seen.get(a))[0];
		if (this.focused && this.pages.includes(this.focused)) return this.focused;
		return this.appPage ?? this.pages[0] ?? null;
	}

	/** Moves the caption if focus changed since last check. */
	async syncFocus() {
		const next = await this.pickFocused();
		if (next === this.focused) return false;
		this.focused = next;
		await this.paint();
		return true;
	}

	/** { name, path } of the vault open in the connected Obsidian. */
	async vault() {
		if (!this.appPage) return null;
		return this.appPage
			.evaluate(() => ({
				name: window.app.vault.getName(),
				path: window.app.vault.adapter?.getBasePath?.() ?? "",
			}))
			.catch(() => null);
	}

	/** Waits until the connected Obsidian has `path` open (it reopens async). */
	async waitForVault(path, { timeout = 60000 } = {}) {
		const start = Date.now();
		let last = null;
		while (Date.now() - start < timeout) {
			await this.refresh();
			const v = await this.vault();
			if (v?.path === path) return v;
			last = v;
			await sleep(600);
		}
		throw new Error(
			`Obsidian is showing ${last ? `"${last.name}" (${last.path})` : "no vault"}, expected ${path}`
		);
	}

	/** Paints the caption on the focused window and blanks it on every other. */
	async paint() {
		const { text, title } = this.caption;
		await Promise.all(
			this.pages.map((page) =>
				page
					.evaluate(
						(t, isTitle, focused, showKeys) => {
							const el = document.getElementById("fc-demo-subtitle");
							if (!el) return;
							// A different line means the next step: back to the bottom.
							// Repaints of the same line (focus moved windows) keep it where
							// the operator put it.
							if (el.textContent !== t && window.__fcDemo) window.__fcDemo.top = false;
							el.textContent = t;
							el.classList.toggle("fc-title", !!isTitle);
							el.classList.toggle("fc-show", !!t);
							window.__fcApplyPlacement?.();
							// The key badge follows the caption: one window at a time.
							if (window.__fcKeys) {
								window.__fcKeys.enabled = !!showKeys && !!focused;
								if (!focused) window.__fcKeys.clear();
							}
						},
						page === this.focused ? text : "",
						title,
						page === this.focused,
						this.showKeys
					)
					.catch(() => {})
			)
		);
	}

	async show(text, { title = false } = {}) {
		this.caption = { text, title };
		await this.syncFocus(); // land it on the window that's actually in front
		await this.paint();
	}

	async hide() {
		this.caption = { text: "", title: false };
		await this.paint();
	}

	/** Removes the injected overlay (leaves the window otherwise untouched). */
	async cleanup() {
		await Promise.all(
			this.pages.map((page) =>
				page
					.evaluate(() => {
						document.getElementById("fc-demo-subtitle")?.remove();
						document.getElementById("fc-demo-subtitle-style")?.remove();
						document.getElementById("fc-demo-keys")?.remove();
						window.__fcKeys?.clear();
					})
					.catch(() => {})
			)
		);
	}

	/** True once the cue chord has been pressed in any window since last call. */
	async cued() {
		let fired = false;
		for (const page of this.pages) {
			const n = await page.evaluate(() => window.__fcDemo?.cue ?? 0).catch(() => null);
			if (n == null) continue;
			const seen = this.cues.get(page) ?? 0;
			if (n > seen) fired = true;
			this.cues.set(page, n); // also resets the baseline after a reload
		}
		return fired;
	}

	/**
	 * Blocks until the operator cues the next subtitle — the chord inside
	 * Obsidian, or Enter in the terminal as a fallback. Rescans windows while
	 * waiting so a settings window opened mid-step still gets the caption.
	 */
	async waitForCue({ onAbort } = {}) {
		const keyboard = terminalCue();
		let tick = 0;
		try {
			for (;;) {
				if (keyboard.aborted) {
					onAbort?.();
					throw new Error("aborted");
				}
				if (keyboard.take() || (await this.cued())) return;
				tick++;
				if (tick % 4 === 0) await this.syncFocus(); // follow the front window
				if (tick % 12 === 0) await this.refresh(); // ~1s: catch new windows
				await sleep(80);
			}
		} finally {
			keyboard.stop();
		}
	}

	disconnect() {
		this.browser.disconnect();
	}
}

/**
 * Enter in the terminal advances too (handy when tuning a scenario without
 * touching Obsidian); `q` aborts the take.
 */
function terminalCue() {
	const state = { pending: false, aborted: false, stop() {} };
	const stdin = process.stdin;
	if (!stdin.isTTY) return { ...state, take: () => false };
	stdin.setRawMode(true);
	stdin.resume();
	const onData = (buf) => {
		const s = buf.toString();
		if (s === "\u0003" || s.toLowerCase() === "q") state.aborted = true; // Ctrl-C or q
		else state.pending = true;
	};
	stdin.on("data", onData);
	return {
		take() {
			const p = state.pending;
			state.pending = false;
			return p;
		},
		get aborted() {
			return state.aborted;
		},
		stop() {
			stdin.off("data", onData);
			stdin.setRawMode(false);
			stdin.pause();
		},
	};
}
