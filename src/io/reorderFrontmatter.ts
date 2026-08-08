/*
 * Rewrites a note's frontmatter in its class's field order (#104).
 *
 * Key position is not addressable through `processFrontMatter`: the only mechanism is, inside
 * one callback, to snapshot the entries, delete every key and re-assign them in the target
 * order — one write (D5). That makes this the most destructive helper in the plugin, so it
 * behaves accordingly:
 *
 *  - the target is built and checked **before** anything is deleted. If the plan and the
 *    snapshot disagree on a single key, nothing is touched;
 *  - values are re-assigned **by reference**, never rebuilt, so block scalars, dates and
 *    nested objects come back exactly as they were;
 *  - when the keys are already in order the callback is never opened at all: no write, no
 *    mtime, no diff.
 */
import { App, TFile } from "obsidian";

import { Field } from "../schema/field";
import { reorderPlan, UnknownKeysPosition, unpositionableKeys } from "../schema/reorder";

export interface ReorderOutcome {
	/** Keys rewritten, or 0 when the note was already in order. */
	moved: number;
	/** Keys YAML will re-sort whatever we asked (integer-like names). */
	unpositionable: string[];
}

/**
 * Reorders `file`'s top-level frontmatter keys to match `fields`. Returns what happened, so a
 * caller can stay quiet about a note that needed nothing.
 */
export async function reorderFrontmatter(
	app: App,
	file: TFile,
	fields: Field[],
	unknown: UnknownKeysPosition = "top"
): Promise<ReorderOutcome> {
	const cached = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!cached) return { moved: 0, unpositionable: [] };

	const plan = reorderPlan(fields, Object.keys(cached), unknown);
	if (!plan) return { moved: 0, unpositionable: [] };

	let moved = 0;
	await app.fileManager.processFrontMatter(file, (fm) => {
		const frontmatter = fm as Record<string, unknown>;
		const entries = new Map(Object.entries(frontmatter));
		const current = [...entries.keys()];

		// The cache can be a step behind the file. Re-plan against what the callback actually
		// holds, and only then decide there is something to do.
		const fresh = sameKeys(current, plan) ? plan : reorderPlan(fields, current, unknown);
		if (!fresh || !sameKeys(current, fresh)) return;

		for (const key of current) delete frontmatter[key];
		for (const key of fresh) frontmatter[key] = entries.get(key);
		moved = fresh.length;
	});

	return { moved, unpositionable: unpositionableKeys(plan) };
}

/** Same keys, any order — the guard that makes the delete/re-assign safe. */
function sameKeys(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const seen = new Set(a);
	return b.every((key) => seen.has(key));
}
