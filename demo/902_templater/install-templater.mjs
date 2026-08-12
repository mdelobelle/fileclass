#!/usr/bin/env node
/*
 * Fetches Templater into the 902 fixture.
 *
 *   node demo/902_templater/install-templater.mjs
 *
 * Templater is a third party's plugin, so its bundle is not committed here — `main.js` alone is
 * 450 kB of someone else's code under someone else's licence. The fixture ships the parts that are
 * ours (its `manifest.json` is kept, so the folder is recognisable, and `data.json`, which is the
 * configuration the probe depends on) and this script brings the rest on demand.
 *
 * Needs the `gh` CLI, which the repo already uses for releases.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "demo-vault", ".obsidian", "plugins", "templater-obsidian");
mkdirSync(out, { recursive: true });

for (const asset of ["main.js", "styles.css"]) {
	if (existsSync(join(out, asset))) {
		console.log(`· ${asset} already there`);
		continue;
	}
	execFileSync(
		"gh",
		["release", "download", "--repo", "SilentVoid13/Templater", "--pattern", asset, "--dir", out],
		{ stdio: "inherit" }
	);
	console.log(`· fetched ${asset}`);
}
console.log("Templater is in the 902 fixture; `node demo/probe.mjs 902 <script>` will run with it.");
