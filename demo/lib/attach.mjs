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
export async function attachWhenReady(
	port = "9222",
	{ vaultPath = null, timeout = 90000, quiet = false } = {}
) {
	const start = Date.now();
	let stage = null;
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
		const ready = await stage.appPage
			?.evaluate(
				(want) => {
					const app = window.app;
					if (!app?.workspace?.layoutReady) return "layout not ready";
					if (want && app.vault.adapter?.getBasePath?.() !== want) return "another vault";
					return app.plugins?.plugins?.fileclass ? true : "plugin not loaded";
				},
				vaultPath
			)
			.catch(() => "no renderer");
		if (ready === true) {
			if (!quiet) console.log(`\x1b[2mattached in ${((Date.now() - start) / 1000).toFixed(1)}s\x1b[0m`);
			return stage;
		}
		lastError = typeof ready === "string" ? ready : lastError;
		await sleep(400);
	}
	throw new Error(`Obsidian never became ready (${lastError}) after ${timeout}ms`);
}
