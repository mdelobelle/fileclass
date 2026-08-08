/*
 * Stage: everything around the recording that isn't the narration itself —
 * building the throw-away vault from a scenario's fixture, making Obsidian open
 * *that* vault with the debug port on, and putting the machine back as it was.
 *
 * Why the vault is copied out of the repo: `demo/` lives inside a real vault
 * (the plugin dev vault), and Obsidian refuses to open a vault nested in
 * another one. The fixture is the versioned pristine state; the run happens in
 * ~/fileclass-demos/<scenario>/<vault> and is wiped after each take.
 *
 * Why obsidian.json is rewritten: Obsidian can't be told to open an arbitrary
 * folder from the command line, so we mark our vault as the one to reopen. The
 * original file is backed up and restored on teardown (including on Ctrl-C).
 */
import { execFileSync, spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Written into every staged vault; nothing without it is ever deleted. */
const MARKER = ".fileclass-demo-vault";
const RUNS_DIR = process.env.FILECLASS_DEMO_HOME || join(homedir(), "fileclass-demos");
const OBSIDIAN_JSON = join(
	homedir(),
	"Library",
	"Application Support",
	"obsidian",
	"obsidian.json"
);
/** Where the pre-run vault list is parked, so a killed run can still be undone. */
const REGISTRY_BACKUP = join(RUNS_DIR, ".obsidian-json.backup");
const APP = process.env.OBSIDIAN_APP || "Obsidian";

/** Community theme every take records with (copied from a local vault). */
const THEME = "Minimal";

/**
 * Config Obsidian gets unless the fixture ships its own. core-plugins.json is
 * read as an exhaustive map, so it lists Obsidian's defaults — plus `bases`,
 * which Fileclass builds on (without it half the features hide themselves).
 */
const DEFAULTS = {
	"core-plugins.json": {
		"file-explorer": true,
		"global-search": true,
		switcher: true,
		graph: true,
		backlink: true,
		canvas: true,
		"outgoing-link": true,
		"tag-pane": true,
		properties: true,
		"page-preview": true,
		"daily-notes": true,
		templates: true,
		"note-composer": true,
		"command-palette": true,
		"editor-status": true,
		bookmarks: true,
		outline: true,
		"word-count": true,
		"file-recovery": true,
		bases: true,
	},
	// Demos always record in LIGHT mode with the Minimal theme, whatever the
	// operator's system appearance is: `moonstone` = light, `obsidian` = dark.
	// Bigger base font so the UI reads on video.
	"appearance.json": {
		baseFontSize: 18,
		theme: "moonstone",
		cssTheme: THEME,
		nativeMenus: false,
	},
	// No prompts a take would have to dismiss on camera: deleting goes straight to
	// the bin, and a rename updates links without asking — which take 014 relies on,
	// since it renames a cover to show the value following it.
	"app.json": { promptDelete: false, alwaysUpdateLinks: true },
};

const isDir = (p) => existsSync(p) && readdirSync(p, { withFileTypes: true }) && true;

function refuse(msg) {
	throw new Error(`Refusing to run: ${msg}`);
}

/** Version of the plugin build in `pluginDir` — what a take records against. */
export function pluginVersion(pluginDir) {
	const manifest = join(pluginDir, "manifest.json");
	if (!existsSync(manifest)) return null;
	try {
		return JSON.parse(readFileSync(manifest, "utf8")).version ?? null;
	} catch {
		return null;
	}
}

/** Absolute path of the vault a scenario runs in (id keeps takes separate). */
export function runVaultPath(scenario) {
	return join(RUNS_DIR, scenario.id, scenario.vaultName);
}

/**
 * (Re)creates the run vault from the scenario fixture: copy, then layer the
 * plugin in when the scenario starts with it installed.
 */
export function stageVault(scenario, pluginDir) {
	const vault = runVaultPath(scenario);
	if (vault === homedir() || vault === resolve("/")) refuse(`"${vault}" is a protected directory`);
	if ((process.cwd() + sep).startsWith(vault + sep)) {
		refuse(`"${vault}" contains the current directory`);
	}
	if (existsSync(vault) && readdirSync(vault).length && !existsSync(join(vault, MARKER))) {
		refuse(`"${vault}" exists and isn't a demo vault (no ${MARKER})`);
	}
	rmSync(vault, { recursive: true, force: true });
	mkdirSync(join(vault, ".obsidian"), { recursive: true });
	writeFileSync(join(vault, MARKER), `Fileclass demo vault (${scenario.id}) — safe to delete.\n`);

	if (isDir(scenario.fixture)) {
		cpSync(scenario.fixture, vault, {
			recursive: true,
			filter: (src) => !src.endsWith(".DS_Store"),
		});
	}

	const themed = installTheme(vault, pluginDir);
	for (const [file, data] of Object.entries(DEFAULTS)) {
		const target = join(vault, ".obsidian", file);
		if (existsSync(target)) continue; // the fixture overrides on purpose
		const value = file === "appearance.json" && !themed ? { ...data, cssTheme: "" } : data;
		writeFileSync(target, JSON.stringify(value, null, 2));
	}

	if (scenario.plugin) installPlugin(vault, pluginDir, scenario.settings ?? {});
	return vault;
}

/**
 * Copies the Minimal theme into the staged vault so every take looks the same.
 * Themes aren't committed here (third-party CSS), so it's borrowed from a vault
 * that already has it: $FILECLASS_DEMO_THEME, the vault hosting this plugin, or
 * any vault Obsidian knows about. Returns false when none has it.
 */
function installTheme(vault, pluginDir) {
	const known = existsSync(OBSIDIAN_JSON)
		? Object.values(JSON.parse(readFileSync(OBSIDIAN_JSON, "utf8")).vaults ?? {}).map((v) =>
				join(v.path, ".obsidian", "themes", THEME)
			)
		: [];
	const sources = [
		process.env.FILECLASS_DEMO_THEME,
		resolve(pluginDir, "..", "..", "themes", THEME), // <host vault>/.obsidian/themes
		...known,
	].filter(Boolean);

	const src = sources.find((p) => existsSync(join(p, "theme.css")));
	if (!src) {
		console.warn(`Note: the ${THEME} theme wasn't found locally — recording in the default theme.`);
		return false;
	}
	cpSync(src, join(vault, ".obsidian", "themes", THEME), { recursive: true });
	return true;
}

/** Copies the built plugin into the vault, enables it, and seeds its settings. */
function installPlugin(vault, pluginDir, settings) {
	const out = join(vault, ".obsidian", "plugins", "fileclass");
	mkdirSync(out, { recursive: true });
	for (const f of ["main.js", "manifest.json", "styles.css"]) {
		const src = join(pluginDir, f);
		if (!existsSync(src)) refuse(`missing ${f} — run \`npm run build\` in the plugin repo first`);
		cpSync(src, join(out, f));
	}
	// `shorterModal` on every staged vault, unless a scenario says otherwise: it takes 90px off
	// a modal and pins it 45px from the top, so a note with sixteen fields stops reaching into
	// the subtitles burned along the bottom of the frame. It has no settings row on purpose —
	// nobody but a screen recorder wants it — so this is where the takes get it.
	const staged = { shorterModal: true, ...settings };
	writeFileSync(join(out, "data.json"), JSON.stringify(staged, null, 2));

	const enabledPath = join(vault, ".obsidian", "community-plugins.json");
	const enabled = existsSync(enabledPath) ? JSON.parse(readFileSync(enabledPath, "utf8")) : [];
	if (!enabled.includes("fileclass")) enabled.push("fileclass");
	writeFileSync(enabledPath, JSON.stringify(enabled, null, 2));
}

/** Deletes the run vault (only ever one carrying the marker). */
export function wipeVault(scenario) {
	const vault = runVaultPath(scenario);
	if (!existsSync(join(vault, MARKER))) return;
	rmSync(vault, { recursive: true, force: true });
	const parent = dirname(vault); // ~/fileclass-demos/<scenario>, now empty
	if (existsSync(parent) && !readdirSync(parent).length) rmSync(parent, { recursive: true });
}

/**
 * Where takes are journalled: sibling of the run vaults, so teardown's wipe
 * never touches them. A take log is what `voiceover.mjs` needs to place each
 * spoken line exactly where its subtitle appeared.
 */
export function takesDir() {
	const dir = join(RUNS_DIR, "takes");
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function writeTakeLog(scenario, log) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const path = join(takesDir(), `${scenario.id}-${stamp}.json`);
	writeFileSync(path, JSON.stringify(log, null, 2));
	return path;
}

/** Most recent take log for a scenario, or null. */
export function latestTakeLog(scenario) {
	const dir = takesDir();
	const hits = readdirSync(dir)
		.filter((f) => f.startsWith(`${scenario.id}-`) && f.endsWith(".json"))
		.sort();
	return hits.length ? join(dir, hits.at(-1)) : null;
}

// --- the Obsidian process ------------------------------------------------------

export function obsidianPids() {
	try {
		return execFileSync("pgrep", ["-f", "Obsidian.app/Contents/MacOS/Obsidian"], {
			encoding: "utf8",
		})
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
	} catch {
		return []; // pgrep exits 1 when nothing matches
	}
}

export async function quitObsidian({ timeout = 15000 } = {}) {
	if (!obsidianPids().length) return;
	try {
		execFileSync("osascript", ["-e", `quit app "${APP}"`], { stdio: "ignore" });
	} catch {
		/* not scriptable / already gone — fall through to the wait + SIGTERM */
	}
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (!obsidianPids().length) return;
		await sleep(300);
	}
	for (const pid of obsidianPids()) {
		try {
			process.kill(Number(pid), "SIGTERM");
		} catch {
			/* already exited */
		}
	}
	await sleep(1000);
}

/**
 * Points Obsidian at `vault` (and only it) on next launch. Returns a restore()
 * that puts the previous obsidian.json back, plus the vaults that were open.
 */
export function captureVaultRegistry(vault) {
	const before = existsSync(OBSIDIAN_JSON) ? readFileSync(OBSIDIAN_JSON, "utf8") : null;
	// Also on disk: a run killed before its teardown takes its in-memory copy with
	// it, and the operator is left with a dead demo vault in their vault list.
	mkdirSync(RUNS_DIR, { recursive: true });
	if (before == null) rmSync(REGISTRY_BACKUP, { force: true });
	else writeFileSync(REGISTRY_BACKUP, before);
	const config = before ? JSON.parse(before) : { vaults: {} };
	const previouslyOpen = Object.values(config.vaults ?? {})
		.filter((v) => v.open)
		.map((v) => v.path);

	const id = createHash("md5").update(vault).digest("hex").slice(0, 16);
	config.vaults ??= {};
	for (const entry of Object.values(config.vaults)) delete entry.open;
	config.vaults[id] = { path: vault, ts: 1700000000000, open: true };
	mkdirSync(dirname(OBSIDIAN_JSON), { recursive: true });
	writeFileSync(OBSIDIAN_JSON, JSON.stringify(config, null, 2));

	return {
		previouslyOpen,
		restore() {
			if (before == null) rmSync(OBSIDIAN_JSON, { force: true });
			else writeFileSync(OBSIDIAN_JSON, before);
			rmSync(REGISTRY_BACKUP, { force: true });
		},
	};
}

/**
 * Puts the vault list back from the on-disk backup — the repair for a run that
 * died before its own teardown. Returns what it did, so a caller can say so.
 */
export function restoreVaultRegistryFromDisk() {
	if (!existsSync(REGISTRY_BACKUP)) return "nothing to restore";
	writeFileSync(OBSIDIAN_JSON, readFileSync(REGISTRY_BACKUP, "utf8"));
	rmSync(REGISTRY_BACKUP, { force: true });
	return "restored the vault list from the backup";
}

/** Launches Obsidian with the CDP port and waits for it to answer. */
export async function launchObsidian(port, { timeout = 40000 } = {}) {
	spawn("open", ["-na", APP, "--args", `--remote-debugging-port=${port}`], {
		stdio: "ignore",
		detached: true,
	}).unref();

	const start = Date.now();
	while (Date.now() - start < timeout) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await sleep(500);
	}
	throw new Error(`Obsidian didn't expose the debug port ${port} within ${timeout / 1000}s`);
}

/** Reopens the vaults that were open before we hijacked the registry. */
export function relaunchObsidian() {
	spawn("open", ["-a", APP], { stdio: "ignore", detached: true }).unref();
}
