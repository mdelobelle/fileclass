/*
 * Lookup recalculation (ARCHITECTURE.md §9). Obsidian side: runs the lookup's
 * base query (getBaseFiles — proven), finds the source notes that link back to
 * the host via `targetFieldName`, computes the output (computeLookupValue), and
 * writes every lookup of a note in one processFrontMatter write (D5).
 *
 * This slice recomputes per host file (on demand / on the note's change). The
 * batch single-scan fan-out across all hosts (§9) is a later refinement.
 */
import { App, TFile } from "obsidian";

import { getBaseFiles } from "../engine/basesAdapter";
import { AdapterHost } from "../fields/candidates";
import { linkTargetPath } from "../fields/links";
import { lookupOptions } from "../fields/options";
import { ValueWrite, writeValues } from "../io/write";
import type FileclassPlugin from "../../main";
import { Field } from "../schema/field";
import { computeLookupValue, isSummarizing, LookupSource } from "./lookup";

function linksToHost(app: App, source: TFile, targetFieldName: string, hostPath: string): boolean {
	const raw = app.metadataCache.getFileCache(source)?.frontmatter?.[targetFieldName];
	const values = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
	return values.some((v) => linkTargetPath(app, v, source.path) === hostPath);
}

function summarizedValue(app: App, source: TFile, fieldName?: string): number | undefined {
	if (!fieldName) return undefined;
	const raw = app.metadataCache.getFileCache(source)?.frontmatter?.[fieldName];
	if (raw == null || raw === "") return undefined;
	const n = Number(raw);
	return Number.isFinite(n) ? n : undefined;
}

/** Computes one Lookup field's value for a host, or undefined to skip. */
export async function resolveLookupValue(
	host: AdapterHost,
	hostFile: TFile,
	field: Field
): Promise<unknown | undefined> {
	const opts = lookupOptions(field);
	if (!opts.baseFile || !opts.targetFieldName || !host.basesAvailable) return undefined;

	const app = host.app;
	const sources = await getBaseFiles(app, opts.baseFile, opts.viewName, hostFile.path);
	const summarizing = isSummarizing(opts.outputType);
	const related: LookupSource[] = sources
		.filter((s) => linksToHost(app, s, opts.targetFieldName!, hostFile.path))
		.map((s) => ({
			basename: s.basename,
			summarized: summarizing ? summarizedValue(app, s, opts.summarizedFieldName) : undefined,
		}));
	return computeLookupValue(opts.outputType, related);
}

/** Recomputes every Lookup field of a note; returns how many were written. */
export async function recalcLookupsForFile(plugin: FileclassPlugin, file: TFile): Promise<number> {
	const fields = plugin.index.getFields(file).filter((f) => f.type === "Lookup");
	if (!fields.length) return 0;

	const writes: ValueWrite[] = [];
	for (const field of fields) {
		try {
			const value = await resolveLookupValue(plugin, file, field);
			if (value !== undefined) writes.push({ namePath: [field.name], value });
		} catch {
			/* a failing lookup must not block the others */
		}
	}
	if (!writes.length) return 0;
	await writeValues(plugin.app, file, writes);
	return writes.length;
}
