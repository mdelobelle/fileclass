/*
 * Obsidian-side value resolution: reads a note-path or Base-view values source
 * and delegates the inline case to the pure `resolveValues` (ARCHITECTURE.md §7,
 * §20.3). Base-view sources go through the adapter (getBaseRows), so the allowed
 * values follow the view's own order (#47), with graceful degradation when Bases
 * is unavailable.
 */
import { TFile } from "obsidian";

import { getBaseRows } from "obsidian-bases-adapter";
import { distinctColumnValues } from "./baseOrder";
import { AdapterHost } from "./candidates";
import { Field } from "../schema/field";
import { listOptions } from "./options";
import { linesOf, resolveNoteFile, resolveValues } from "./values";

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
			// Rows in the view's own order (#47). A chosen column: its distinct
			// non-empty values (first occurrence wins). Otherwise the file names.
			const result = await getBaseRows(
				host.app,
				opts.baseFile,
				opts.viewName,
				contextFile?.path
			);
			if (opts.valuesColumn) return distinctColumnValues(result.rows, opts.valuesColumn);
			return result.rows.map((row) => row.file.basename);
		} catch {
			return [];
		}
	}

	if (opts.sourceType === "ValuesListNotePath" && opts.valuesListNotePath) {
		// Resolve tolerantly (exact path, then linkpath) so a path without the
		// `.md` extension — or an MDM-style value — still finds the note.
		const file = resolveNoteFile(
			opts.valuesListNotePath,
			(p) => host.app.vault.getFileByPath(p),
			(lp, src) => host.app.metadataCache.getFirstLinkpathDest(lp, src)
		);
		if (!(file instanceof TFile)) return [];
		const content = await host.app.vault.cachedRead(file);
		return resolveValues(field, () => linesOf(content));
	}

	return resolveValues(field);
}
