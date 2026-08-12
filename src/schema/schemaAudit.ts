/*
 * Auditing what a schema points at (#159).
 *
 * The rename warning only fires when Obsidian tells us about a rename — so a file moved while the
 * plugin was off, from the Finder, or by a sync client on another machine, breaks a fileClass with
 * nobody in the room. That is very likely how the reporter got there. This is the sweep that
 * catches those: every path a class stores, asked whether it still resolves.
 *
 * Pure — existence is an injected predicate, so the rules are unit-tested without a vault. The walk
 * over the real classes is `schemaAuditRun.ts`.
 */
import { LogLevel } from "../log/logLine";

/** What the audit can find, in the log's own grammar. */
export type FindingKind =
	| "missing-path"
	| "missing-folder"
	| "missing-parent"
	| "dead-tag"
	| "unknown-exclude";

export interface Finding {
	fileClass: string;
	/** The field the problem belongs to, absent for a class-level one. */
	field?: string;
	kind: FindingKind;
	level: LogLevel;
	/** The offending value, as stored. */
	value: string;
	/** What it costs, in the words the notice and the log both use. */
	consequence: string;
}

/** What the audit needs to know about the world, injected so the rules stay pure. */
export interface AuditWorld {
	fileExists(path: string): boolean;
	folderExists(path: string): boolean;
	/** Class names the vault has, for `extends`. */
	knownClasses: ReadonlySet<string>;
	/**
	 * Every field name this class **inherits**, across the whole ancestor chain — what `excludes` is
	 * allowed to name.
	 *
	 * The chain, not the direct parent: `excludes` drops inherited fields and inheritance runs all
	 * the way up, so excluding a grandparent's field is ordinary use. Asking the parent alone
	 * reported it as a mistake — a user hit this on a three-deep chain.
	 */
	inheritedFieldNames(fileClass: string): readonly string[];
}

/** The schema shape the audit reads — the same frontmatter the index parses. */
export interface AuditedClass {
	name: string;
	extends?: string;
	excludes?: readonly string[];
	mapWithTag?: boolean;
	tagNames?: readonly string[];
	filesPaths?: readonly string[];
	baseFile?: string;
	fields: readonly {
		name: string;
		options: Record<string, unknown>;
	}[];
}

/** A note path may be stored with or without its extension — the resolver accepts both. */
function noteResolves(path: string, world: AuditWorld): boolean {
	return world.fileExists(path) || (!path.endsWith(".md") && world.fileExists(`${path}.md`));
}

/**
 * Everything wrong with one class, in the order a reader would meet it.
 *
 * Only what can be settled by looking: a path resolves or it does not, a tag can bind or it cannot.
 * Nothing here guesses at intent, and nothing here is a style opinion — a log that argued with the
 * author would be closed and never reopened.
 */
export function auditClass(cls: AuditedClass, world: AuditWorld): Finding[] {
	const found: Finding[] = [];
	const at = (field: string | undefined, kind: FindingKind, level: LogLevel, value: string, consequence: string): void => {
		found.push({ fileClass: cls.name, field, kind, level, value, consequence });
	};

	for (const field of cls.fields) {
		const o = field.options ?? {};
		const notePath = typeof o.valuesListNotePath === "string" ? o.valuesListNotePath : "";
		if (notePath && !noteResolves(notePath, world)) {
			at(field.name, "missing-path", "ERROR", notePath, "the field offers no values");
		}
		const baseFile = typeof o.baseFile === "string" ? o.baseFile : "";
		if (baseFile && !world.fileExists(baseFile)) {
			at(field.name, "missing-path", "ERROR", baseFile, "the field offers no candidates");
		}
		const canvasPath = typeof o.canvasPath === "string" ? o.canvasPath : "";
		if (canvasPath && !world.fileExists(canvasPath)) {
			at(field.name, "missing-path", "ERROR", canvasPath, "the field stops following the canvas");
		}
	}

	if (cls.baseFile && !world.fileExists(cls.baseFile)) {
		at(undefined, "missing-path", "ERROR", cls.baseFile, "the class has no base to sync");
	}

	for (const path of cls.filesPaths ?? []) {
		const clean = path.replace(/\/+$/, "");
		if (clean && !world.folderExists(clean)) {
			at(undefined, "missing-folder", "ERROR", path, "no note is bound by this folder");
		}
	}

	if (cls.extends && !world.knownClasses.has(cls.extends)) {
		// Inheritance fails whole: every field of the parent is missing, and nothing says so.
		at(undefined, "missing-parent", "ERROR", cls.extends, "the inherited fields are missing");
	}

	// `mapWithTag` makes the class name a tag, and the index skips any tag with whitespace in it —
	// so a class whose name has a space claims nothing at all, silently (measured, #149).
	const tags = [...(cls.tagNames ?? [])];
	if (cls.mapWithTag) tags.push(cls.name);
	for (const tag of tags) {
		const name = tag.trim().replace(/^#/, "");
		if (!name || /\s/u.test(name)) {
			at(undefined, "dead-tag", "WARNING", tag, "a tag cannot contain a space, so it binds nothing");
		}
	}

	if (cls.extends && world.knownClasses.has(cls.extends)) {
		const inherited = new Set(world.inheritedFieldNames(cls.name));
		for (const excluded of cls.excludes ?? []) {
			if (excluded && !inherited.has(excluded)) {
				at(undefined, "unknown-exclude", "WARNING", excluded, "no ancestor declares that field");
			}
		}
	}

	return found;
}

/**
 * What makes two findings the same problem, across sweeps.
 *
 * Not the message, which is prose and may be reworded: the kind, the class, the field and the
 * offending value. A problem that persists keeps its fingerprint, so it is logged once and not once
 * per session.
 */
export function fingerprint(f: Pick<Finding, "kind" | "fileClass" | "field" | "value">): string {
	return [f.kind, f.fileClass, f.field ?? "", f.value].join("|");
}

/** A log entry, as much of it as the diff needs. */
export interface LoggedFinding {
	event: string;
	details?: Record<string, unknown>;
}

/** The fingerprint an already-logged entry stands for, or null when it is not a finding. */
export function loggedFingerprint(entry: LoggedFinding): string | null {
	const fp = entry.details?.fingerprint;
	return typeof fp === "string" && fp ? fp : null;
}

/**
 * What this sweep should write, given everything already written.
 *
 * A log that repeated its findings every session would drown the one line that says something
 * *changed* — and the retention cap would then rotate away real history to make room for copies.
 * So a problem is logged when it appears, and again only if it comes back after being fixed.
 *
 * Its disappearance is worth a line too: `schema.resolved` turns the file into a record of what
 * happened rather than a snapshot of what is wrong, which is what a timestamped log is for.
 */
export function diffFindings(
	history: readonly LoggedFinding[],
	current: readonly Finding[]
): { fresh: Finding[]; resolved: string[] } {
	const open = new Set<string>();
	for (const entry of history) {
		const fp = loggedFingerprint(entry);
		if (!fp) continue;
		if (entry.event === "schema.resolved") open.delete(fp);
		else open.add(fp);
	}
	const currentPrints = new Set(current.map(fingerprint));
	return {
		fresh: current.filter((f) => !open.has(fingerprint(f))),
		resolved: [...open].filter((fp) => !currentPrints.has(fp)),
	};
}

/** `Book › author` — how a finding names itself in a notice, a log line or the viewer. */
export function findingLabel(f: Finding): string {
	return f.field ? `${f.fileClass} › ${f.field}` : f.fileClass;
}

/** One line summarising a sweep, for the notice that follows it. */
export function describeAudit(findings: readonly Finding[]): string {
	if (!findings.length) return "Fileclass: every fileClass points at something that exists.";
	const errors = findings.filter((f) => f.level === "ERROR").length;
	const warnings = findings.length - errors;
	const parts = [
		errors ? `${errors} broken reference${errors > 1 ? "s" : ""}` : "",
		warnings ? `${warnings} that will never bind` : "",
	].filter(Boolean);
	return `Fileclass: ${parts.join(", ")} — see the schema log.`;
}
