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

export async function callApi<T = unknown>(method: string, args: unknown[] = []): Promise<T> {
	const call = `app.plugins.plugins.fileclass.api.${method}(${args
		.map((a) => JSON.stringify(a))
		.join(", ")})`;
	// Return-value strategy (assumes eval awaits + prints the resolved value):
	const js = `Promise.resolve(${call}).then(r => ${JSON.stringify(SENTINEL)} + JSON.stringify(r))`;
	// console.log fallback (uncomment if the probe shows eval doesn't print the value):
	// const js = `Promise.resolve(${call}).then(r => console.log(${JSON.stringify(SENTINEL)} + JSON.stringify(r)))`;

	// The Obsidian CLI takes named params: `eval code=<javascript>`.
	const evalArgs = ["eval", `code=${js}`];
	if (process.env.FILECLASS_VAULT) evalArgs.push(`vault=${process.env.FILECLASS_VAULT}`);

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
	return JSON.parse(json) as T;
}
