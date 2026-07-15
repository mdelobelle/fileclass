/*
 * Obsidian-side value resolution: reads a note-path or Base-view values source
 * and delegates the inline case to the pure `resolveValues` (ARCHITECTURE.md §7,
 * §20.3). Base-view sources go through the adapter (getBaseFiles) with graceful
 * degradation when Bases is unavailable.
 */
import { TFile } from "obsidian";

import { getBaseFiles } from "../engine/basesAdapter";
import { AdapterHost } from "./candidates";
import { Field } from "../schema/field";
import { listOptions } from "./options";
import { linesOf, resolveValues } from "./values";

/**
 * Resolves a list field's allowed values (empty = unconstrained / free entry).
 * `contextFile` resolves `this.file` in Base filters for a base-view source.
 */
export async function resolveFieldValues(
	host: AdapterHost,
	field: Field,
	contextFile?: TFile
): Promise<string[]> {
	const opts = listOptions(field);

	if (opts.sourceType === "ValuesFromBase") {
		if (!opts.baseFile || !host.basesAvailable) return [];
		try {
			const files = await getBaseFiles(host.app, opts.baseFile, opts.viewName, contextFile?.path);
			return files.map((f) => f.basename);
		} catch {
			return [];
		}
	}

	if (opts.sourceType === "ValuesListNotePath" && opts.valuesListNotePath) {
		const file = host.app.vault.getFileByPath(opts.valuesListNotePath);
		if (!(file instanceof TFile)) return [];
		const content = await host.app.vault.cachedRead(file);
		return resolveValues(field, () => linesOf(content));
	}

	return resolveValues(field);
}
