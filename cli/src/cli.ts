#!/usr/bin/env node
/*
 * `fileclass` CLI — terminal access to the Fileclass Obsidian plugin. Thin layer
 * over the plugin API (via the Obsidian CLI's `eval`); the app must be running.
 */
import { parseArgs } from "node:util";

import { CONFIG_FILE, readConfig, writeConfig } from "./config.js";
import { json, table } from "./format.js";
import { callApi, probeVault } from "./transport.js";
import type {
	BulkResult,
	FileClassSummary,
	NoteExplain,
	NoteRow,
	SchemaDef,
	Violation,
	WriteResult,
} from "./types.js";
import { parseWhere } from "./where.js";

const CLI_VERSION = "0.0.1";

const USAGE = `fileclass — typed frontmatter from the terminal (needs Obsidian running).

Usage: fileclass <command> [args] [--vault <name>] [--json]

Interactive
  tui                               browse fileClasses → notes → fields and edit

Vault
  vault                             the vault this CLI is talking to
  use <name>                        persist a default vault (use --clear to unset)

Inspect
  fileclasses                       list every fileClass
  schema <fileClass>                a fileClass's options and fields
  explain <note>                    a note's fileClasses and resolved fields
  list <fileClass> [--columns a,b] [--where "<field> <op> [value]"] [--limit N]
  get <note> <field>                a field's current value

Validate
  validate [--fileclass X | --path P | --folder F]   report schema violations
                                                     (exit 1 if any) — CI-friendly

Edit
  set <note> <field> <value>        set a value (validated)
  set-where <fileClass> <field> <value> [--where "..."] [--apply]
                                    bulk set; dry-run unless --apply

Filters (--where): <field> is|isNot|contains|isEmpty|isNotEmpty [value]
Target vault: --vault <name>  >  FILECLASS_VAULT env  >  'use' default  >  active
Global: --json, -v/--version, -h/--help
Env: OBSIDIAN_BIN (obsidian binary), FILECLASS_VAULT, FILECLASS_QUIET`;

function fail(message: string): never {
	console.error(message);
	process.exit(2);
}
function need(value: string | undefined, name: string): string {
	if (!value) fail(`Missing <${name}>. See --help.`);
	return value;
}
function coerce(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			json: { type: "boolean", default: false },
			columns: { type: "string" },
			where: { type: "string" },
			limit: { type: "string" },
			fileclass: { type: "string" },
			path: { type: "string" },
			folder: { type: "string" },
			apply: { type: "boolean", default: false },
			vault: { type: "string" },
			clear: { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
		},
	});

	if (values.version) return console.log(CLI_VERSION);
	const [cmd, ...args] = positionals;
	if (!cmd || values.help) return console.log(USAGE);

	// Persist/inspect the default vault.
	if (cmd === "use") {
		if (values.clear) {
			writeConfig({});
			return console.log("Default vault cleared.");
		}
		if (!args[0]) {
			const cur = readConfig().vault;
			return console.log(cur ? `default vault: ${cur}` : "No default vault set.");
		}
		const requested = args[0];
		const reached = await probeVault(requested);
		if (!reached || reached.toLowerCase() !== requested.toLowerCase()) {
			fail(
				reached
					? `fileclass: no open vault named "${requested}" (Obsidian answered "${reached}"). Not saved.`
					: `fileclass: couldn't reach a vault named "${requested}". Is it open in Obsidian? Not saved.`
			);
		}
		writeConfig({ vault: reached });
		return console.log(`Default vault set to "${reached}" (${CONFIG_FILE}).`);
	}

	// Target vault precedence: --vault > FILECLASS_VAULT env > `use` default.
	const vault = values.vault ?? process.env.FILECLASS_VAULT ?? readConfig().vault;
	if (vault) process.env.FILECLASS_VAULT = vault;

	const out = <T>(result: T, pretty: (r: T) => string): void =>
		console.log(values.json ? json(result) : pretty(result));

	switch (cmd) {
		case "tui": {
			const { runTui } = await import("./tui.js");
			return runTui();
		}

		case "vault": {
			const info = await callApi<{ name: string; path: string }>("vaultInfo");
			return out(info, (i) => `${i.name}\n${i.path}`);
		}

		case "fileclasses": {
			const r = await callApi<FileClassSummary[]>("listFileClasses");
			return out(r, (rows) => table(rows, ["name", "extends", "fieldCount", "hasBase", "icon"]));
		}

		case "schema": {
			const fc = need(args[0], "fileClass");
			const r = await callApi<SchemaDef | null>("getSchema", [fc]);
			if (!r) fail(`No fileClass "${fc}".`);
			return out(r, (s) =>
				`# ${s.name}${s.ancestors.length ? ` (extends ${s.ancestors.join(" › ")})` : ""}\n\n` +
				table(s.fields, ["name", "type", "path"])
			);
		}

		case "explain": {
			const note = need(args[0], "note");
			const r = await callApi<NoteExplain | null>("explain", [note]);
			if (!r) fail(`No fileClass applies to "${note}".`);
			return out(r, (e) =>
				`# ${e.path}\nfileClasses: ${e.fileClasses.join(", ")}\n\n` +
				table(e.fields, ["name", "type", "owner", "present", "display"])
			);
		}

		case "list": {
			const fc = need(args[0], "fileClass");
			const opts = {
				columns: values.columns?.split(",").map((c) => c.trim()),
				where: parseWhere(values.where),
				limit: values.limit ? Number(values.limit) : undefined,
			};
			const rows = await callApi<NoteRow[]>("listNotes", [fc, opts]);
			return out(rows, (rs) => table(rs.map((r) => ({ path: r.path, ...r.values }))));
		}

		case "get": {
			const note = need(args[0], "note");
			const field = need(args[1], "field");
			const v = await callApi<unknown>("getValue", [note, field]);
			return out(v, (x) => (Array.isArray(x) ? x.map(String).join(", ") : String(x ?? "")));
		}

		case "set": {
			const note = need(args[0], "note");
			const field = need(args[1], "field");
			const value = coerce(args.slice(2).join(" "));
			const r = await callApi<WriteResult>("setValue", [note, field, value]);
			if (!r.ok) process.exitCode = 1;
			return out(r, (w) => (w.ok ? `✓ set ${field} on ${note}` : `✗ ${w.message}`));
		}

		case "validate": {
			const scope = { fileClass: values.fileclass, path: values.path, folder: values.folder };
			const violations = await callApi<Violation[]>("validate", [scope]);
			if (violations.length) process.exitCode = 1;
			return out(violations, (vs) =>
				vs.length ? table(vs, ["path", "field", "type", "message"]) : "✓ no violations"
			);
		}

		case "set-where": {
			const fc = need(args[0], "fileClass");
			const field = need(args[1], "field");
			const value = coerce(args.slice(2).join(" "));
			const where = parseWhere(values.where);
			if (!values.apply) {
				const matched = await callApi<NoteRow[]>("listNotes", [fc, { columns: [], where }]);
				return out({ matched: matched.length }, (m) =>
					`${m.matched} note(s) match. Re-run with --apply to write.`
				);
			}
			const r = await callApi<BulkResult>("setValueWhere", [fc, field, value, where]);
			if (!r.ok) process.exitCode = 1;
			return out(r, (b) => `changed ${b.changed}, skipped ${b.skipped}, errors ${b.errors.length}`);
		}

		default:
			fail(`Unknown command "${cmd}". See --help.`);
	}
}

main().catch((e: Error) => {
	console.error(e.message);
	process.exit(1);
});
