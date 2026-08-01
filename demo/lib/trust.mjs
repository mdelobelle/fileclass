/*
 * Getting past "Do you trust the author of this vault?".
 *
 * Obsidian holds a new vault's community plugins behind that dialog, and remembers
 * the answer in localStorage under `enable-plugin-<vault id>` — an id derived from
 * the vault's path. Every take stages its own path, so every take meets the dialog
 * once: the plugin never loads, a smoke test has nothing to inspect, and a take
 * would open on camera with a modal in front of it.
 *
 * Clicking it is safe here in a way it would never be in general: the vault was
 * staged by this tooling seconds ago and the only plugin in it is the one being
 * demonstrated, copied from this repo's own build.
 */

/** True when a page is showing the trust dialog. */
const TRUST_TEXT = /trust the author of this vault/i;
const TRUST_BUTTON = /trust author/i;

/**
 * Accepts the trust dialog if it's up, in whichever window shows it.
 * @returns true when a dialog was accepted, false when there was none.
 */
export async function acceptVaultTrust(stage) {
	for (const page of stage.pages) {
		const clicked = await page
			.evaluate(
				(textSrc, buttonSrc) => {
					const text = new RegExp(textSrc, "i");
					const button = new RegExp(buttonSrc, "i");
					for (const modal of document.querySelectorAll(".modal-container")) {
						if (!text.test(modal.textContent ?? "")) continue;
						const accept = [...modal.querySelectorAll("button")].find((b) =>
							button.test(b.textContent ?? "")
						);
						if (accept) {
							accept.click();
							return true;
						}
					}
					return false;
				},
				TRUST_TEXT.source,
				TRUST_BUTTON.source
			)
			.catch(() => false);
		if (clicked) return true;
	}
	return false;
}

/**
 * Closes what accepting the dialog opened: Obsidian lands the operator in
 * Settings → Community plugins, and a take would open with that in frame.
 *
 * It is closed in whichever shape this build uses — a pane inside the main window
 * (`app.setting.close()`), or its own window, which has no `window.app` at all and
 * so can only be asked to close itself. Only ever called right after we clicked the
 * trust dialog: we opened it, we close it.
 */
export async function dismissSettings(stage, { timeout = 2500, poll = 250 } = {}) {
	const start = Date.now();
	// Obsidian opens it *after* the trust flow settles, so waiting for it beats
	// firing once and hoping.
	while (Date.now() - start < timeout) {
		if (await closeSettingsOnce(stage)) return true;
		await new Promise((r) => setTimeout(r, poll));
	}
	return false;
}

async function closeSettingsOnce(stage) {
	await stage.refresh().catch(() => {});
	let closed = false;
	for (const page of stage.pages) {
		const isApp = await page.evaluate(() => !!window.app).catch(() => false);
		if (isApp) {
			const had = await page
				.evaluate(() => {
					const open = !!document.querySelector(".modal-container.mod-settings");
					window.app?.setting?.close?.();
					return open;
				})
				.catch(() => false);
			closed = closed || had;
			continue;
		}
		const isSettings = await page
			.evaluate(() => !!document.querySelector(".vertical-tab-header, .settings-modal-container"))
			.catch(() => false);
		if (isSettings) {
			// Electron refuses `window.close()` for a window it opened itself, and this
			// renderer has no `window.app` to ask nicely — so the target is closed the
			// way the operator's click on the cross would: from outside.
			await page.keyboard.press("Escape").catch(() => {});
			if (!page.isClosed()) await page.close().catch(() => {});
			closed = true;
		}
	}
	return closed;
}

/**
 * Waits for the plugin to be loaded, accepting the trust dialog as soon as it
 * appears. Both are the same wait from the caller's point of view: "is the plugin
 * there yet, and is anything obvious in the way?"
 *
 * `requirePlugin: false` is for a take that installs Fileclass on camera: there is
 * no plugin to wait for, and waiting the full timeout reads as a hang — which is
 * how one operator ended up installing the plugin by hand to unblock the runner,
 * then uninstalling it, which is a fine way to open a base while the plugin is
 * absent. One pass still clears a trust dialog, in case the fixture ships plugins
 * of its own.
 */
export async function waitForPlugin(stage, { timeout = 25000, poll = 500, requirePlugin = true } = {}) {
	const deadline = Date.now() + (requirePlugin ? timeout : 0);
	let trusted = false;
	for (;;) {
		const loaded = await stage.appPage
			.evaluate(() => !!window.app.plugins.plugins.fileclass)
			.catch(() => false);
		if (loaded) return { loaded: true, trusted };
		await stage.refresh(); // the dialog may live in its own window
		if (await acceptVaultTrust(stage)) trusted = true;
		if (Date.now() >= deadline) return { loaded: false, trusted };
		await new Promise((r) => setTimeout(r, poll));
	}
}
