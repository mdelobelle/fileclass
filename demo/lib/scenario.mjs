/*
 * Scenario loading: resolve `001` → `001_install_and_param_fileclass/`, and
 * parse its `scenario.yaml`.
 *
 * The parser is a deliberately tiny YAML subset (no dependency): top-level
 * scalars, one level of nested map (`settings:`), and a `steps:` list of maps.
 * It is forgiving on purpose — a scenario file is a narration script written by
 * hand, so `initial pause` works as well as `initial_pause`, and a step can be
 * a bare line (`- Open settings`) instead of `- title: Open settings`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Step keys we recognise; anything else on a `- ` line is the title itself. */
/**
 * `input:` is a value the operator would otherwise type on camera — coordinates, a
 * link, a long id. The caption shows it, and ⌘⌃⌥⇧I types it into whatever field is
 * focused, which keeps a take from becoming a typing lesson.
 */
const STEP_KEYS = new Set(["title", "pause", "hold", "note", "input"]);

const ROOT_KEYS = new Set([
	"title",
	"description",
	"doc",
	"tags",
	"vault_name",
	"plugin",
	"settings",
	"pronounce",
	"initial_pause",
	"default_pause",
	"steps",
]);

/** Root keys whose value is an indented map rather than a scalar. */
const MAP_KEYS = new Set(["settings", "pronounce"]);

/** `1500`, `"1.5s"`, `"800ms"` → milliseconds. */
export function duration(value, fallback = 0) {
	if (value == null || value === "") return fallback;
	if (typeof value === "number") return Math.max(0, Math.round(value));
	const m = String(value)
		.trim()
		.match(/^([\d.]+)\s*(ms|s)?$/i);
	if (!m) throw new Error(`Not a duration: "${value}" (use 1500, "1.5s" or "800ms")`);
	const n = Number(m[1]);
	return Math.max(0, Math.round(m[2]?.toLowerCase() === "s" ? n * 1000 : n));
}

/**
 * Drops a trailing `# comment`. A quoted value ends at its closing quote; an
 * unquoted one is cut at ` # ` (space-hash-space) only, so a subtitle can still
 * say "Fileclass #003" or "#tags" without losing half of itself.
 */
function stripComment(raw) {
	const s = raw.trim();
	const q = s[0];
	if (q === '"' || q === "'") {
		const end = s.indexOf(q, 1);
		if (end > 0) return s.slice(0, end + 1);
	}
	return s.replace(/\s+#\s.*$/, "").trim();
}

function scalar(raw) {
	const s = stripComment(raw);
	if (s === "" || s === "~" || s === "null") return null;
	if (s === "{}") return {};
	if (s === "true" || s === "yes") return true;
	if (s === "false" || s === "no") return false;
	if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
	}
	return s;
}

/** `initial pause` / `Initial-Pause` → `initial_pause`. */
const normKey = (k) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");

/**
 * Splits `key: value`, returning null when the line isn't a mapping. `raw` keeps
 * the key verbatim — nested maps are plugin settings, where case matters
 * (`classFilesPath`), unlike our own keys.
 */
function mapping(line) {
	const m = line.match(/^([^:]+?):(?:\s+(.*))?$/);
	if (!m) return null;
	return { raw: m[1].trim(), key: normKey(m[1]), value: m[2] ?? "" };
}

export function parseScenario(text, source = "scenario.yaml") {
	const doc = {};
	const steps = [];
	let mode = "root"; // root | map | steps
	let mapName = null;
	let step = null;
	let lineNo = 0;

	for (const raw of text.split(/\r?\n/)) {
		lineNo++;
		const line = raw.replace(/\t/g, "  ").replace(/\s+$/, "");
		const body = line.trim();
		if (!body || body.startsWith("#") || body === "---") continue;
		const indent = line.length - line.trimStart().length;
		const where = `${source}:${lineNo}`;

		// A list item — only `steps:` has a list in this schema.
		if (body.startsWith("- ")) {
			if (mode !== "steps") throw new Error(`${where}: list item outside "steps:"`);
			const rest = body.slice(2).trim();
			step = {};
			steps.push(step);
			const kv = mapping(rest);
			if (kv && STEP_KEYS.has(kv.key)) step[kv.key] = scalar(kv.value);
			else step.title = scalar(rest);
			continue;
		}

		const kv = mapping(body);
		if (!kv) throw new Error(`${where}: expected "key: value", got "${body}"`);

		// Indented → belongs to the current step or nested map.
		if (indent > 0 && (mode === "steps" || mode === "map")) {
			if (mode === "steps") {
				if (!step) throw new Error(`${where}: indented key before the first "- " step`);
				if (!STEP_KEYS.has(kv.key)) throw new Error(`${where}: unknown step key "${kv.key}"`);
				step[kv.key] = scalar(kv.value);
			} else {
				doc[mapName][kv.raw] = scalar(kv.value);
			}
			continue;
		}

		// Top-level key.
		if (!ROOT_KEYS.has(kv.key)) throw new Error(`${where}: unknown key "${kv.key}"`);
		if (kv.key === "steps") {
			mode = "steps";
			step = null;
			continue;
		}
		if (kv.value.trim() === "" && MAP_KEYS.has(kv.key)) {
			doc[kv.key] = {};
			mode = "map";
			mapName = kv.key;
			continue;
		}
		doc[kv.key] = scalar(kv.value);
		mode = "root";
	}

	if (!steps.length) throw new Error(`${source}: no steps`);
	steps.forEach((s, i) => {
		if (!s.title) throw new Error(`${source}: step ${i + 1} has no title`);
	});

	const defaultPause = duration(doc.default_pause, 1000);
	return {
		title: doc.title ?? "Untitled scenario",
		description: doc.description ?? "",
		// Where the feature is documented (path under the docs site) and the extra
		// YouTube tags for this take — both only used when publishing.
		doc: doc.doc ?? "",
		tags: String(doc.tags ?? "")
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean),
		vaultName: doc.vault_name ?? "Demo",
		plugin: doc.plugin === true,
		settings: doc.settings && typeof doc.settings === "object" ? doc.settings : null,
		pronounce: doc.pronounce && typeof doc.pronounce === "object" ? doc.pronounce : null,
		initialPause: duration(doc.initial_pause, 1500),
		defaultPause,
		steps: steps.map((s) => ({
			title: String(s.title),
			pause: duration(s.pause, defaultPause),
			hold: s.hold === true,
			input: s.input === undefined ? null : String(s.input),
		})),
	};
}

/**
 * Finds the scenario directory whose name starts with `id` (`001`, or the full
 * `001_install_and_param_fileclass`). Lists what's available when it can't.
 */
export function resolveScenarioDir(demoDir, id) {
	const dirs = readdirSync(demoDir, { withFileTypes: true })
		// `016b_` is allowed: a take that belongs next to 016, not at the end of the
		// series. Sorting keeps 016 before 016b before 017.
		.filter((e) => e.isDirectory() && /^\d{3}[a-z]?_/.test(e.name))
		.map((e) => e.name)
		.sort();
	if (!id) {
		throw new Error(`Which scenario? Available:\n  ${dirs.join("\n  ") || "(none yet)"}`);
	}
	const key = String(id).replace(/\/+$/, "");
	const hits = dirs.filter((d) => d === key || d.startsWith(`${key}_`) || d.startsWith(key));
	if (hits.length !== 1) {
		throw new Error(
			`${hits.length ? "Ambiguous" : "Unknown"} scenario "${id}". Available:\n  ${dirs.join("\n  ")}`
		);
	}
	const dir = join(demoDir, hits[0]);
	const yaml = join(dir, "scenario.yaml");
	if (!existsSync(yaml)) throw new Error(`${hits[0]}: missing scenario.yaml`);
	return { dir, name: hits[0], yaml };
}

export function loadScenario(demoDir, id) {
	const { dir, name, yaml } = resolveScenarioDir(demoDir, id);
	const scenario = parseScenario(readFileSync(yaml, "utf8"), basename(yaml));
	return { ...scenario, id: name, dir, fixture: join(dir, "demo-vault") };
}
