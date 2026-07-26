/*
 * Seeds a demo vault for the onboarding video with Fileclass PRE-INSTALLED and
 * configured (classFilesPath = Classes/). Installing from the Community-plugins
 * store on camera opens several separate windows in this Obsidian build — too
 * fragile/jumpy for a clean recording — so the video shows a caption + a calm
 * settings glance, and creates fileClasses/notes live (step 2).
 *
 *   node seed.mjs                       # ~/fileclass-demo-vault
 *   node seed.mjs --vault /some/path    # elsewhere (outside any vault!)
 *
 * Build the plugin first (repo root): npm run build.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, ".."); // the fileclass plugin repo root

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function fail(msg) {
	console.error(`Refusing to seed: ${msg}`);
	process.exit(1);
}

// Default OUTSIDE any vault — a vault nested inside another can't be opened.
const vault = resolve(arg("vault", join(homedir(), "fileclass-demo-vault")));
const force = process.argv.includes("--force");
const MARKER = ".fileclass-demo-vault";

// --- guards: never rm -rf real data ------------------------------------------
if (vault === homedir() || vault === resolve("/")) fail(`"${vault}" is a protected directory.`);
if (process.cwd() === vault || (process.cwd() + sep).startsWith(vault + sep)) {
	fail(`"${vault}" is an ancestor of the current directory.`);
}
if (existsSync(vault) && readdirSync(vault).length && !existsSync(join(vault, MARKER)) && !force) {
	fail(`"${vault}" exists and isn't a previous demo vault. Use a different --vault, or --force.`);
}

console.log(`Seeding demo vault at ${vault}`);
rmSync(vault, { recursive: true, force: true });
const pluginOut = join(vault, ".obsidian", "plugins", "fileclass");
mkdirSync(pluginOut, { recursive: true });
writeFileSync(join(vault, MARKER), "Fileclass onboarding demo vault — safe to delete.\n");

// --- install the built plugin ------------------------------------------------
for (const f of ["main.js", "manifest.json", "styles.css"]) {
	const src = join(pluginDir, f);
	if (!existsSync(src)) fail(`missing ${f} — run \`npm run build\` in the plugin first.`);
	cpSync(src, join(pluginOut, f));
}

const write = (rel, data) =>
	writeFileSync(join(vault, rel), typeof data === "string" ? data : JSON.stringify(data, null, 2));

write(".obsidian/community-plugins.json", ["fileclass"]);
write(".obsidian/appearance.json", { baseFontSize: 18, theme: "obsidian" });
write(".obsidian/app.json", { promptDelete: false });

// NB: the Classes/ folder and the classFilesPath setting are created ON CAMERA
// in step 1 — the seed only pre-installs the plugin (the store install opens
// several separate windows in this build, too jumpy to record).

console.log(`\nDone. Vault: ${vault}\n`);
console.log("One-time setup (off camera):");
console.log("  1. Obsidian → Open another vault → Open folder as vault → pick the folder above.");
console.log("  2. If prompted, turn on community plugins / trust; ensure Fileclass and core Bases are enabled.");
console.log("  3. Quit Obsidian, relaunch with remote debugging:");
console.log("       open -na Obsidian --args --remote-debugging-port=9222");
console.log("Then: start recording → node record.mjs 1  (intro) → node record.mjs 2  (create + fill)");
