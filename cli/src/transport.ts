/*
 * Bridge to the running Obsidian app: calls the Fileclass plugin API through the
 * Obsidian CLI's `eval` command (which runs JS in the live app), so the CLI
 * reuses the plugin's index, Bases, and validation with full fidelity.
 *
 * CONTRACT ASSUMPTION (confirm with `obsidian eval "Promise.resolve(42)"`):
 * `obsidian eval "<expr>"` awaits the top-level expression and prints its
 * resolved value to stdout. We make the expression resolve to SENTINEL + JSON
 * and slice it out, so any other stdout (logs, a value echo) is ignored. If the
 * probe shows eval does NOT await/print the return value, switch to the
 * console.log variant noted below.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN ?? "obsidian";
const SENTINEL = "__FCJSON__";

/**
 * Confirms a vault is reachable (open in Obsidian) and returns its actual name,
 * or null if it can't be reached. Raw eval — no plugin needed.
 */
export async function probeVault(vault: string): Promise<string | null> {
	const js = `(() => ${JSON.stringify(SENTINEL)} + JSON.stringify(app.vault.getName()))()`;
	try {
		const { stdout } = await run(OBSIDIAN_BIN, [`vault=${vault}`, "eval", `code=${js}`], {
			maxBuffer: 1 << 20,
		});
		const idx = stdout.lastIndexOf(SENTINEL);
		if (idx === -1) return null;
		return JSON.parse(stdout.slice(idx + SENTINEL.length).trim().split("\n")[0]) as string;
	} catch {
		return null;
	}
}

export async function callApi<T = unknown>(method: string, args: unknown[] = []): Promise<T> {
	const argList = args.map((a) => JSON.stringify(a)).join(", ");
	const S = JSON.stringify(SENTINEL);
	// Defensive: report the vault, a clear message if the plugin is absent in the
	// target vault, and any API error — all as a structured { v, r?, err? } after
	// the sentinel. The whole expression resolves to that string (eval prints it).
	const js =
		`(() => { const v = app.vault.getName(); const p = app.plugins.plugins.fileclass;` +
		` if (!p) return Promise.resolve(${S} + JSON.stringify({ v, err: "The Fileclass plugin isn't enabled in this vault." }));` +
		` if (!p.api) return Promise.resolve(${S} + JSON.stringify({ v, err: "The Fileclass plugin in this vault has no API — update it to a build that exposes plugin.api." }));` +
		` return Promise.resolve().then(() => p.api.${method}(${argList}))` +
		` .then(r => ${S} + JSON.stringify({ v, r }))` +
		` .catch(e => ${S} + JSON.stringify({ v, err: String((e && e.message) || e) })); })()`;

	// The Obsidian CLI takes `vault=<name>` before the command, then
	// `eval code=<javascript>`.
	const evalArgs: string[] = [];
	if (process.env.FILECLASS_VAULT) evalArgs.push(`vault=${process.env.FILECLASS_VAULT}`);
	evalArgs.push("eval", `code=${js}`);

	let stdout: string;
	try {
		({ stdout } = await run(OBSIDIAN_BIN, evalArgs, { maxBuffer: 64 * 1024 * 1024 }));
	} catch (e) {
		const err = e as { stderr?: string; message: string };
		throw new Error(
			`fileclass: 'obsidian eval' failed. Is Obsidian running with the Fileclass plugin enabled?\n${
				err.stderr?.trim() || err.message
			}`
		);
	}

	const idx = stdout.lastIndexOf(SENTINEL);
	if (idx === -1) {
		throw new Error(`fileclass: no response from the plugin.\n---\n${stdout.trim()}`);
	}
	const json = stdout.slice(idx + SENTINEL.length).trim().split("\n")[0];
	const { v, r, err } = JSON.parse(json) as { v: string; r?: T; err?: string };
	// Always surface the target vault (on stderr, so stdout/JSON pipes stay clean).
	if (!process.env.FILECLASS_QUIET) process.stderr.write(`vault: ${v}\n`);
	if (err !== undefined) throw new Error(`fileclass: ${err}`);
	return r as T;
}
