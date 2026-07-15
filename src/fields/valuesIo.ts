/*
 * Obsidian-side value resolution: reads a note-path values source and delegates
 * to the pure `resolveValues` (ARCHITECTURE.md §7). Base-view-sourced values
 * arrive with Wave B via the adapter.
 */
import { App, TFile } from "obsidian";

import { Field } from "../schema/field";
import { listOptions } from "./options";
import { linesOf, resolveValues } from "./values";

/** Resolves a list field's allowed values (empty = unconstrained / free entry). */
export async function resolveFieldValues(app: App, field: Field): Promise<string[]> {
	const opts = listOptions(field);
	if (opts.sourceType === "ValuesListNotePath" && opts.valuesListNotePath) {
		const file = app.vault.getFileByPath(opts.valuesListNotePath);
		if (!(file instanceof TFile)) return [];
		const content = await app.vault.cachedRead(file);
		return resolveValues(field, () => linesOf(content));
	}
	return resolveValues(field);
}
