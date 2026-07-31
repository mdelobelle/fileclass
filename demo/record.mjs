#!/usr/bin/env node
/*
 * Runs a demo scenario: stage its vault, open it in a debuggable Obsidian, and
 * narrate over your shoulder while YOU perform the demo.
 *
 *   node record.mjs 001            # 001_install_and_param_fileclass
 *   node record.mjs 002 --keep     # leave the vault as you left it (inspect it)
 *   node record.mjs 002 --attach   # don't touch the vault/app, just narrate
 *   node record.mjs 002 --dry      # print the script + pauses, run nothing
 *
 * How a take goes:
 *   1. it stages ~/fileclass-demos/<scenario>/<vault> from the scenario fixture,
 *   2. quits your Obsidian and relaunches it on that vault with the debug port,
 *   3. waits `initial_pause`, then shows subtitle #1,
 *   4. you do the action, then press the cue chord — the subtitle fades out, the
 *      scenario waits that step's `pause`, and the next subtitle fades in,
 *   5. after the last step it closes Obsidian, restores your vault list, and
 *      resets the demo vault to its fixture state.
 *
 * Start your screen recorder (QuickTime: File → New Screen Recording) before
 * step 3 — nothing is captured by this script.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

import { loadScenario } from "./lib/scenario.mjs";
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
	writeTakeLog,
} from "./lib/stage.mjs";
import { CUE_LABEL, connect } from "./lib/subtitles.mjs";
import { waitForPlugin } from "./lib/trust.mjs";
import { DEFAULT_RATE, resolveVoice, speak, spokenText } from "./lib/voice.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, "..");

const flag = (name) => process.argv.includes(`--${name}`);
const opt = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const id = process.argv.slice(2).find((a) => !a.startsWith("--"));
const port = opt("port", process.env.OBSIDIAN_CDP_PORT || "9222");
const attach = flag("attach");
const keep = flag("keep");
const dry = flag("dry");
const titleCard = flag("title-card");
const speakLive = flag("speak");
const rate = Number(opt("rate", DEFAULT_RATE));

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

let scenario;
try {
	scenario = loadScenario(here, id);
} catch (err) {
	console.error(`\n${err?.message || err}\n`);
	process.exit(1);
}
const total = scenario.steps.length;

console.log(`\n${bold(scenario.title)}  ${dim(`(${scenario.id})`)}`);
if (scenario.description) console.log(dim(scenario.description));
console.log(
	dim(
		`${total} steps · vault "${scenario.vaultName}" · plugin ${
			scenario.plugin ? "pre-installed" : "not installed"
		}`
	)
);

if (dry) {
	console.log(`\n  ${dim(`initial pause ${scenario.initialPause}ms`)}`);
	scenario.steps.forEach((s, i) =>
		console.log(
			`  ${String(i + 1).padStart(2)}. ${s.title}\n      ${dim(
				`cue → ${s.hold ? "hold caption, " : ""}wait ${s.pause}ms`
			)}`
		)
	);
	console.log(`\n  ${dim("→ teardown")}\n${dim(`Would stage: ${runVaultPath(scenario)}`)}\n`);
	process.exit(0);
}

// --- teardown plan, honoured on success, failure and Ctrl-C --------------------
let stage = null;
let registry = null;
let staged = false;
let launched = false;
let quitTheirs = false;
let torn = false;
let speaking = null; // the `say` child, so Ctrl-C doesn't leave it talking
let takeLog = null;

/**
 * Undoes exactly what this run did — nothing more. Aborting before the vault is
 * staged (at the "quit it?" prompt, say) must not close the operator's Obsidian,
 * hence the `staged`/`launched` flags rather than a blanket `!attach`.
 */
async function teardown({ silent = false } = {}) {
	if (torn) return;
	torn = true;
	speaking?.stop();
	if (stage) {
		await stage.hide().catch(() => {});
		await stage.cleanup().catch(() => {});
		stage.disconnect();
	}
	if (launched && !keep) await quitObsidian();
	registry?.restore();
	if (staged && !keep) wipeVault(scenario);
	if (quitTheirs && !keep) relaunchObsidian();
	if (silent) return;
	if (!staged) return;
	console.log(
		keep
			? dim(`\nKept ${runVaultPath(scenario)} — re-run without --keep to reset it.`)
			: dim("\nVault reset, Obsidian restored.")
	);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
	process.on(sig, async () => {
		await teardown();
		process.exit(130);
	});
}

async function main() {
	let vaultPath = runVaultPath(scenario);

	if (!attach) {
		if (obsidianPids().length) {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			const answer = flag("yes")
				? "y"
				: (await rl.question("Obsidian is running — quit it for the demo? [Y/n] ")).trim();
			rl.close();
			if (answer && !/^y(es)?$/i.test(answer)) {
				console.log("Aborted (use --attach to narrate over the Obsidian you already have open).");
				process.exit(1);
			}
			quitTheirs = true;
			await quitObsidian();
		}
		vaultPath = stageVault(scenario, pluginDir);
		staged = true;
		console.log(dim(`Staged   ${vaultPath}`));
		registry = captureVaultRegistry(vaultPath);
		await launchObsidian(port);
		launched = true;
	}

	stage = await connect(port);
	if (attach) {
		const v = await stage.vault();
		console.log(dim(`Attached to "${v?.name}" (${v?.path})`));
	} else {
		await stage.waitForVault(vaultPath);
		// A staged vault is new to Obsidian, which holds its plugins behind a trust
		// dialog — dismissed here so the take doesn't open with a modal in frame.
		const { loaded, trusted } = await waitForPlugin(stage);
		if (trusted) console.log(dim("Accepted this vault's trust prompt"));
		if (!loaded) console.warn(dim("Warning: Fileclass isn't loaded in that vault."));
		console.log(dim(`Opened   "${scenario.vaultName}"`));
	}

	const voice = speakLive ? await resolveVoice(opt("voice")) : null;
	if (voice) console.log(dim(`Speaking with "${voice}" at ${rate} wpm`));

	// The take starts on the cue, not on a timer: QuickTime has to be armed by
	// hand, and no fixed countdown survives that in practice.
	console.log(
		`\n${bold("Start your screen recorder, then press")} ${bold(CUE_LABEL)} ${bold("in Obsidian to begin.")}\n` +
			dim(`The same chord advances every step · Enter here also works · q aborts\n`)
	);
	await stage.waitForCue();

	// t0 = the starting cue. Every offset in the take log is relative to it, which
	// is what lets voiceover.mjs land each line on the right frame.
	const t0 = Date.now();
	const at = () => Date.now() - t0;
	// The version the take records against: what the fixture installed, or null
	// when the plugin is installed from the store on camera (take 001).
	const log = {
		scenario: scenario.id,
		title: scenario.title,
		pluginVersion: scenario.plugin ? pluginVersion(pluginDir) : null,
		voice,
		rate,
		steps: [],
	};

	if (titleCard) {
		await stage.show(scenario.title, { title: true });
		await sleep(scenario.initialPause);
		await stage.hide();
		await sleep(600);
	} else {
		await sleep(scenario.initialPause);
	}

	for (const [i, step] of scenario.steps.entries()) {
		await stage.show(step.title);
		const shownAt = at();
		console.log(`${dim(`${String(i + 1).padStart(2)}/${total}`)}  ${step.title}`);
		const line = voice ? speak(spokenText(step.title, scenario.pronounce), { voice, rate }) : null;
		speaking = line;
		try {
			await stage.waitForCue();
		} catch (err) {
			line?.stop(); // aborted mid-sentence
			throw err;
		}
		// Never cut a caption mid-sentence: let the line land before it fades.
		if (line) await Promise.race([line.done, sleep(6000)]);
		speaking = null;
		if (!step.hold) await stage.hide();
		log.steps.push({ index: i + 1, title: step.title, shownAt, cuedAt: at(), pause: step.pause });
		await sleep(step.pause);
	}
	await stage.hide();
	await sleep(400);
	log.endedAt = at();
	takeLog = writeTakeLog(scenario, log);
	console.log(dim(`\nScenario finished. Take log: ${takeLog}`));
}

// No top-level await here on purpose: Ctrl-C exits from the signal handler, and
// Node would print an "unsettled top-level await" warning over the goodbye.
main()
	.then(() => teardown())
	.catch(async (err) => {
		const aborted = err?.message === "aborted";
		await teardown({ silent: aborted });
		if (aborted) {
			console.log(dim("\nAborted — vault reset, Obsidian restored."));
			process.exit(130);
		}
		console.error(`\n${err?.message || err}\n`);
		process.exit(1);
	});
