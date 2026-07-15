/*
 * Resolves the allowed values of a list field (Select/Cycle/Multi) from its
 * source (ARCHITECTURE.md §7). Pure — the note-reading side effect is injected
 * so this stays unit-testable. Base-view-sourced values (replacing dataview
 * queries) arrive with Wave B; here that source yields no constraint.
 */
import { Field } from "../schema/field";
import { listOptions } from "./options";

/** Reads the non-empty, trimmed lines of a note by path (injected). */
export type NoteLinesReader = (notePath: string) => string[];

/**
 * Returns the allowed values in order. An empty result means "unconstrained"
 * (free entry) — e.g. a note-path source with no reader, or a base-view source.
 */
export function resolveValues(field: Field, readNoteLines?: NoteLinesReader): string[] {
	const opts = listOptions(field);
	switch (opts.sourceType) {
		case "ValuesListNotePath": {
			if (!opts.valuesListNotePath || !readNoteLines) return [];
			return readNoteLines(opts.valuesListNotePath)
				.map((l) => l.trim())
				.filter((l) => l.length > 0);
		}
		case "ValuesFromDVQuery":
			// Replaced by base-view sourcing in a later wave; unconstrained for now.
			return [];
		case "ValuesList":
		default:
			return Object.values(opts.valuesList);
	}
}

/** Splits raw note text into lines (helper for a NoteLinesReader). */
export function linesOf(content: string): string[] {
	return content.split(/\r?\n/);
}
