#!/usr/bin/env node
/*
 * Runs a throwaway script against a staged demo vault, then puts everything back.
 *
 *   node probe.mjs 014 /tmp/check-thumbnails.mjs
 *   node probe.mjs 014 /tmp/check.mjs --keep    # leave the vault open to look at it
 *
 * Why this exists: the habit was to background `smoke.mjs` with a `sleep 300`
 * pipe, run a probe next to it, and wait for the timer to close the app. When the
 * probe finished early the wait was dead time; when the probe threw, Obsidian was
 * left open on a staged vault and someone had to quit it by hand. A timer is not a
 * lifecycle.
 *
 * Here one process owns it: stage → launch → wait until the plugin is actually
 * ready → run the script → tear down in a `finally`, and on SIGINT/SIGTERM too.
 *
 * The script is an ES module exporting a default async function:
 *
 *   export default async function ({ stage, page, vault, sleep }) { … }
 *
 * `stage` is the CDP Stage (subtitles.mjs), `page` its app renderer, `vault` the
 * staged vault's path. Throwing marks the run failed; teardown happens regardless.
 */
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

import { loadScenario } from "./lib/scenario.mjs";
import { attachWhenReady } from "./lib/attach.mjs";
import {
	captureVaultRegistry,
	launchObsidian,
	obsidianPids,
	pluginVersion,
	quitObsidian,
	relaunchObsidian,
	runVaultPath,
	sleep,
	stageVault,
	wipeVault,
} from "./lib/stage.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, "..");
const flag = (name) => process.argv.includes(`--${name}`);
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [scenarioArg, scriptArg] = positional;
if (!scenarioArg || !scriptArg) {
	console.error("usage: node probe.mjs <scenario> <script.mjs> [--keep] [--port 9222]");
	process.exit(2);
}
const scenario = loadScenario(here, scenarioArg);
const scriptPath = resolve(process.cwd(), scriptArg);
const port = process.env.OBSIDIAN_CDP_PORT || "9222";
const keep = flag("keep");

let registry = null;
let launched = false;
let staged = false;
let quitTheirs = false;
let tornDown = false;

async function teardown() {
	if (tornDown) return;
	tornDown = true;
	if (keep) {
		console.log(dim(`\nLeft open on ${runVaultPath(scenario)} — quit Obsidian, then run again to reset.`));
		return;
	}
	if (launched) await quitObsidian();
	registry?.restore();
	if (staged) wipeVault(scenario);
	if (quitTheirs) relaunchObsidian();
}

// A killed run used to leave the app open on a staged vault. Not any more.
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		void teardown().then(() => process.exit(130));
	});
}

async function main() {
	if (obsidianPids().length) {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		const answer = flag("yes")
			? "y"
			: (await rl.question("Obsidian is running — quit it for the probe? [Y/n] ")).trim();
		rl.close();
		if (answer && !/^y(es)?$/i.test(answer)) process.exit(1);
		quitTheirs = true;
		await quitObsidian();
	}

	const vault = stageVault(scenario, pluginDir);
	staged = true;
	registry = captureVaultRegistry(vault);
	console.log(dim(`Staged   ${vault} (plugin ${pluginVersion(pluginDir) ?? "?"})`));
	await launchObsidian(port);
	launched = true;

	const stage = await attachWhenReady(port, { vaultPath: vault });
	const probe = await import(pathToFileURL(scriptPath).href);
	if (typeof probe.default !== "function") {
		throw new Error(`${scriptArg} must export a default async function ({ stage, page, vault })`);
	}
	console.log(dim(`Running  ${scriptArg}\n`));
	await probe.default({ stage, page: stage.appPage, vault, sleep });
	stage.disconnect();
}

main()
	.then(async () => {
		await teardown();
		console.log(ok("\nprobe done, vault reset"));
	})
	.catch(async (err) => {
		console.error(bad(`\nprobe failed: ${err?.message ?? err}`));
		await teardown();
		process.exit(1);
	});
