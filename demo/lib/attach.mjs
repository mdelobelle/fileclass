/*
 * Attach to a debuggable Obsidian as soon as it is actually ready.
 *
 * A probe launched next to `smoke.mjs` runs in its own process and can't see the
 * waiting that smoke does (vault open → trust prompt → plugin load → index). The
 * habit was to pad with a fixed `sleep 45`, which is dead time when the app was up
 * in twelve seconds and a flake when it wasn't. This polls the two things that
 * actually matter and returns the moment they hold.
 */
import { connect } from "./subtitles.mjs";
import { acceptVaultTrust, dismissSettings } from "./trust.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves with a connected Stage once the debug port answers and the plugin has
 * loaded in the open vault.
 *
 * @param port        CDP port
 * @param vaultPath   optional: also wait for this vault to be the open one
 * @param timeout     ms before giving up (the whole launch, not one attempt)
 * @param quiet       don't report how long it took
 */
const dim = (text) => `\x1b[2m${text}\x1b[0m`;

export async function attachWhenReady(
	port = "9222",
	{ vaultPath = null, timeout = 90000, quiet = false, requirePlugin = true } = {}
) {
	const start = Date.now();
	let stage = null;
	let accepted = false;
	let lastError = "the debug port never answered";
	while (Date.now() - start < timeout) {
		if (!stage) {
			stage = await connect(port).catch(() => null);
			if (!stage) {
				await sleep(400);
				continue;
			}
		}
		await stage.refresh().catch(() => {});
		// A staged vault is new to Obsidian, so it asks whether the author is
		// trusted — and the plugin does not load until that is answered. The dialog
		// can live in its own window, hence the refresh above.
		if (await acceptVaultTrust(stage).catch(() => false)) {
			accepted = true;
			if (!quiet) console.log(dim("Accepted this vault's trust prompt"));
		}
		const ready = await stage.appPage
			?.evaluate(
				(want, need) => {
					const app = window.app;
					if (!app?.workspace?.layoutReady) return "layout not ready";
					if (want && app.vault.adapter?.getBasePath?.() !== want) return "another vault";
					// A take that installs the plugin on camera (`plugin: false`) has none
					// to wait for; waiting anyway is how the tour's first probe timed out.
					if (!need) return true;
					return app.plugins?.plugins?.fileclass ? true : "plugin not loaded";
				},
				vaultPath,
				requirePlugin
			)
			.catch(() => "no renderer");
		if (ready === true) {
			// Accepting the trust dialog lands Obsidian in Settings → Community plugins,
			// which it opens once the flow settles — later than the click, so this waits
			// for it. Not conditioned on having accepted: a freshly staged vault has no
			// business showing a settings window, and this way the cleanup can't race.
			if (await dismissSettings(stage, { timeout: accepted ? 4000 : 600 }).catch(() => false)) {
				if (!quiet) console.log(dim("Closed the settings window it opened"));
			}
			if (!quiet) console.log(dim(`attached in ${((Date.now() - start) / 1000).toFixed(1)}s`));
			return stage;
		}
		lastError = typeof ready === "string" ? ready : lastError;
		await sleep(400);
	}
	throw new Error(`Obsidian never became ready (${lastError}) after ${timeout}ms`);
}
