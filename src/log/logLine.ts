/*
 * One line of the schema log (#159), written and read back.
 *
 * The log exists to be read **months later**, by a reader who wants to know when a field went
 * empty — so a line has to survive two audiences: a terminal, and the viewer that formats it. Hence
 * tab-separated fields with a JSON tail:
 *
 *   2026-08-12 08:15:51\tWARNING\tschema.stale-path\t"Authors.base" moved\t{"refs":[…]}
 *
 * Readable as it stands, and parsed by splitting on tabs rather than by a regex over prose.
 *
 * Pure, so both halves are one definition: `parseLine(formatLine(x))` is a test, not a hope.
 */

/**
 * What a line means, in the plugin's own grammar (§ the log's purpose):
 *
 * - `ERROR` — Fileclass cannot do what a definition told it: a path pointing at nothing, a base it
 *   cannot read, an `extends` naming a class the vault does not have.
 * - `WARNING` — a definition that will never do anything, silently: a tag that cannot bind, an
 *   `excludes` naming a field the parent never declared.
 * - `INFO` — a write Fileclass performed across files nobody had open: a rename migrated, a base
 *   synced, a canvas drawn.
 *
 * The log records **consequences**, not edits. Editing history is git's job, and Obsidian's File
 * Recovery already answers "what did this look like yesterday".
 */
export const LOG_LEVELS = ["INFO", "WARNING", "ERROR"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
	stamp: string;
	level: LogLevel;
	/** A dotted, stable event id — `schema.stale-path`, `schema.migrated` — never a sentence. */
	event: string;
	/** One line a human reads first. */
	message: string;
	/** Anything the viewer may want to act on; absent when there is nothing structured to say. */
	details?: Record<string, unknown>;
}

const SEP = "\t";

/** Tabs and newlines are the record separators, so they cannot survive inside a field. */
function oneLine(text: string): string {
	return text.replace(/[\t\r\n]+/g, " ").trim();
}

/** `2026-08-12 08:20:14`, in the reader's own time: a log is read where it was written. */
export function logStamp(date: Date): string {
	const p = (n: number): string => String(n).padStart(2, "0");
	return (
		`${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
		`${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
	);
}

export function formatLine(entry: LogEntry): string {
	const fields = [entry.stamp, entry.level, oneLine(entry.event), oneLine(entry.message)];
	if (entry.details && Object.keys(entry.details).length) {
		fields.push(JSON.stringify(entry.details));
	}
	return fields.join(SEP);
}

/**
 * A line read back, or null when it is not one of ours.
 *
 * Null rather than a throw, and null for the header comments too: the viewer walks whatever the
 * file holds, including lines a person typed into it, and a log that refused to open because of one
 * bad line would fail exactly when it is needed.
 */
export function parseLine(line: string): LogEntry | null {
	if (!line.trim() || line.startsWith("#")) return null;
	const [stamp, level, event, message, details] = line.split(SEP);
	if (!stamp || !level || !event) return null;
	if (!(LOG_LEVELS as readonly string[]).includes(level)) return null;
	return {
		stamp,
		level: level as LogLevel,
		event,
		message: message ?? "",
		...(details ? { details: safeJson(details) } : {}),
	};
}

function safeJson(text: string): Record<string, unknown> | undefined {
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

/** Every entry a file holds, oldest first — the order they were written in. */
export function parseLog(content: string): LogEntry[] {
	return content
		.split("\n")
		.map(parseLine)
		.filter((e): e is LogEntry => e !== null);
}

/** The header a fresh log opens with, so a terminal reader knows what they are looking at. */
export const LOG_HEADER = [
	"# Fileclass log — what happened to your schemas, and what Fileclass did to your vault.",
	"# One line per event: timestamp, level, event id, message, JSON details.",
	"# Fileclass never edits a fileClass definition on its own; these are yours to act on.",
	"",
].join("\n");
