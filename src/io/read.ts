/*
 * Frontmatter reads (ARCHITECTURE.md §4, D2). All reads go through the metadata
 * cache and objectPath — no note-text parsing. Value locations in frontmatter
 * are keyed by field **name** (nested fields add their parents' names, computed
 * by the Object editor in a later wave).
 */
import { App, TFile } from "obsidian";

import { getAtPath, PathSegment } from "../engine/objectPath";
import { Field } from "../schema/field";

/** A shallow copy of a note's frontmatter (empty object when none). */
export function readFrontmatter(app: App, file: TFile): Record<string, unknown> {
	return { ...(app.metadataCache.getFileCache(file)?.frontmatter ?? {}) };
}

/** Reads the value at a name-path within a note's frontmatter. */
export function readValueAtPath(app: App, file: TFile, namePath: PathSegment[]): unknown {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	return getAtPath(frontmatter, namePath);
}

/** Reads a root field's value (keyed by its name). */
export function readFieldValue(app: App, file: TFile, field: Field): unknown {
	return readValueAtPath(app, file, [field.name]);
}

/** True when a root field's key is present in the note's frontmatter. */
export function hasFieldKey(app: App, file: TFile, field: Field): boolean {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	return !!frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, field.name);
}
