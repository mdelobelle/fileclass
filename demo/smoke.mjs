#!/usr/bin/env node
/*
 * Checks a scenario against a live Obsidian before you record it.
 *
 *   node smoke.mjs 007            # stage the vault, launch, report, keep it open
 *   node smoke.mjs 007 --close    # …and quit when the report is printed
 *   node smoke.mjs 007 --attach   # report against the Obsidian already running
 *
 * Why: a subtitle names real UI — a command, a setting, a field type. When one of
 * those drifts, the take lies, and you only find out on camera. Take 003 was
 * recorded against an input that silently refused what its own script asked the
 * viewer to type; that class of surprise is what this catches, in the two minutes
 * before Record rather than the twenty after.
 *
 * It reports, it never fixes: everything it prints is either a fact about the
 * staged vault or a phrase in the script that matches nothing in the app.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
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
} from "./lib/stage.mjs";
import { fieldTypesFromSource, scanScript } from "./lib/scriptScan.mjs";
import { waitForPlugin } from "./lib/trust.mjs";
import { connect } from "./lib/subtitles.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, "..");
const flag = (name) => process.argv.includes(`--${name}`);
const opt = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;

const scenario = loadScenario(here, process.argv.slice(2).find((a) => !a.startsWith("--")));
const port = opt("port", process.env.OBSIDIAN_CDP_PORT || "9222");
const attach = flag("attach");

let registry = null;
let launched = false;
let staged = false;
let quitTheirs = false;
let tornDown = false;

async function teardown() {
	// Idempotent: a signal can arrive while the normal path is already running it.
	if (tornDown) return;
	tornDown = true;
	if (launched) await quitObsidian();
	registry?.restore();
	if (staged) wipeVault(scenario);
	if (quitTheirs) relaunchObsidian();
}

/** Everything the app can tell us about the staged vault, in one round trip. */
async function inspect(stage) {
	// The settings pane is DOM-only, so it has to be open to read its labels.
	await stage.appPage.evaluate(() => {
		window.app.setting.open();
		window.app.setting.openTabById("fileclass");
	});
	await sleep(700);
	await stage.refresh();

	let settingNames = [];
	for (const page of stage.pages) {
		const names = await page
			.evaluate(() =>
				[...document.querySelectorAll(".mod-settings .setting-item-name")]
					.map((e) => e.textContent?.trim())
					.filter(Boolean)
			)
			.catch(() => []);
		if (names.length) settingNames = names;
	}

	const facts = await stage.appPage.evaluate(() => {
		const app = window.app;
		const p = app.plugins.plugins.fileclass;
		if (!p) return { version: null, basesAvailable: false, classNames: [], commands: [], notes: [] };
		const commands = Object.values(app.commands.commands)
			.filter((c) => c.id.startsWith("fileclass:"))
			.map((c) => c.name.replace(/^Fileclass:\s*/, ""));
		const notes = app.vault
			.getMarkdownFiles()
			.map((f) => ({
				path: f.path,
				classes: p.index.getFileClasses(f),
				fields: p.index.getFields(f).map((x) => `${x.name}:${x.type}`),
				keys: Object.keys(app.metadataCache.getFileCache(f)?.frontmatter ?? {}),
			}))
			.sort((a, b) => a.path.localeCompare(b.path));
		return {
			version: p?.manifest?.version ?? null,
			basesAvailable: !!p?.basesAvailable,
			classNames: p.index.fileClassNames,
			commands,
			notes,
		};
	});

	await stage.appPage.evaluate(() => window.app.setting.close());
	return { ...facts, settingNames };
}

function report(facts) {
	console.log(`\n${bold(scenario.title)}  ${dim(`(${scenario.id})`)}`);
	console.log(
		dim(
			`plugin ${facts.version ?? "?"} · Bases ${facts.basesAvailable ? "available" : warn("unavailable")}` +
				` · classes: ${facts.classNames.join(", ") || "(none)"}`
		)
	);

	console.log(`\n${bold("Vault as the take will find it")}`);
	for (const n of facts.notes) {
		const declared = n.fields.map((f) => f.split(":")[0]);
		const missing = n.classes.length ? declared.filter((name) => !n.keys.includes(name)) : [];
		const bits = [
			n.classes.length ? `class ${n.classes.join("+")}` : dim("no class"),
			n.keys.length ? `keys ${n.keys.join(", ")}` : dim("no frontmatter"),
		];
		console.log(`  ${n.path}\n    ${bits.join(" · ")}`);
		if (missing.length) console.log(`    ${dim(`fields not yet inserted: ${missing.join(", ")}`)}`);
	}

	console.log(`\n${bold("What the script names")}`);
	const scan = scanScript(scenario.steps, {
		commands: facts.commands,
		settingNames: facts.settingNames,
		fieldTypes: FIELD_TYPES,
	});
	for (const step of scan) {
		const found = [
			...step.commands.map((c) => `command "${c}"`),
			...step.settings.map((x) => `setting "${x}"`),
			...step.types.map((t) => `type ${t}`),
		];
		const line = `  ${String(step.index).padStart(2)}. ${step.title}`;
		console.log(step.suspicious ? warn(line) : line);
		if (found.length) console.log(dim(`      ${found.join(" · ")}`));
		if (step.claimsCommand) console.log(warn("      says to run something, but names no known command"));
		if (step.claimsSetting) console.log(warn("      mentions settings, but names no setting of this pane"));
	}

	const suspicious = scan.filter((s) => s.suspicious).length;
	console.log(
		suspicious
			? warn(`\n${suspicious} step(s) to re-read: the UI may have drifted from the script.`)
			: ok("\nEvery step that names UI matches something the app exposes.")
	);
}

/** The plugin's own type list, read from source so it can't drift. */
const FIELD_TYPES = fieldTypesFromSource(
	readFileSync(resolve(pluginDir, "src/schema/field.ts"), "utf8")
);

async function main() {
	let vaultPath = runVaultPath(scenario);
	if (!attach) {
		if (obsidianPids().length) {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			const answer = flag("yes")
				? "y"
				: (await rl.question("Obsidian is running — quit it for the smoke test? [Y/n] ")).trim();
			rl.close();
			if (answer && !/^y(es)?$/i.test(answer)) process.exit(1);
			quitTheirs = true;
			await quitObsidian();
		}
		// A smoke test inspects what the plugin makes of the fixture, so it always
		// gets the plugin — even for a take that installs it on camera (`plugin:
		// false`), where waiting for a plugin nobody installed used to fail after 25s.
		vaultPath = stageVault({ ...scenario, plugin: true }, pluginDir);
		staged = true;
		console.log(dim(`Staged   ${vaultPath} (plugin ${pluginVersion(pluginDir) ?? "?"})`));
		registry = captureVaultRegistry(vaultPath);
		await launchObsidian(port);
		launched = true;
	}

	const stage = await connect(port);
	if (!attach) await stage.waitForVault(vaultPath);
	const { loaded, trusted } = await waitForPlugin(stage);
	if (trusted) console.log(dim("Accepted this vault's trust prompt (staged vaults are new to Obsidian)"));
	if (!loaded) {
		throw new Error(
			"Fileclass never loaded in that vault — Restricted mode may be on for it, " +
				"or the plugin build is missing (run `npm run build`)."
		);
	}
	await sleep(800); // let the index settle once the plugin is up
	report(await inspect(stage));
	stage.disconnect();

	if (flag("close") || attach) return;

	// Nobody can press Enter when stdin isn't a terminal — a piped or scripted run.
	// Waiting there used to end the process the moment stdin reached EOF, *before*
	// the teardown below: Obsidian stayed open on the staged vault and the operator's
	// vault list kept pointing at it, which then poisoned the next run's backup.
	if (!process.stdin.isTTY) {
		console.log(dim("\nNot a terminal — closing Obsidian and resetting the vault."));
		return;
	}

	console.log(
		dim(
			"\nObsidian stays open on the staged vault — play the steps by hand if you want.\n" +
				"Press Enter here to close it and reset the vault."
		)
	);
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		// Whichever comes first: the operator's Enter, or stdin closing under us
		// (Ctrl-D, or the terminal going away). `question()` never settles on EOF.
		await Promise.race([rl.question(""), once(rl, "close")]);
	} finally {
		rl.close();
	}
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.on(sig, async () => {
		await teardown();
		process.exit(130);
	});
}

main()
	.then(() => teardown())
	.catch(async (err) => {
		await teardown();
		console.error(`\n${err?.message || err}\n`);
		process.exit(1);
	});
