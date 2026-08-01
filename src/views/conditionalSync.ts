/*
 * Putting a field's dependency into its bound base (#19) — the app-facing half.
 *
 * Called when a field definition is saved. Reads the base, adds or updates the
 * generated formula and view, writes it back. Everything the author wrote stays:
 * other views, other formulas, filters, column widths.
 */
import { Notice, TFile, parseYaml, stringifyYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import {
	conditionalViewName,
	formulaName,
	hasDependency,
	matchFormula,
} from "../fields/conditional";
import { FieldType } from "../schema/field";
import { confirmCloseOpenBase, detachAndAwaitSave, openBaseLeaves } from "./baseSync";
import { ensureConditionalView } from "./conditionalView";

/** Whether the generated view is present, to tell "nothing to do" from "no scope". */
function viewExists(base: unknown, name: string): boolean {
	const views = (base as { views?: unknown })?.views;
	return Array.isArray(views) && views.some((v) => (v as { name?: string })?.name === name);
}

export interface ConditionalRequest {
	/** The `.base` the field takes its candidates from. */
	baseFile: string;
	/** The view the author picked — the scope the generated one narrows. */
	sourceView: string;
	source: string;
	sourceType: FieldType;
	match: string;
}

/**
 * Generates the formula + view for `req` and returns the view name the field
 * should point at, or null when nothing could be written (no base, unreadable
 * base, or the author declined to close it). Never throws at the caller: a field
 * definition must save even if its base can't be touched right now.
 */
export async function applyConditional(
	plugin: FileclassPlugin,
	req: ConditionalRequest
): Promise<string | null> {
	if (!hasDependency(req.source, req.match)) return null;
	const app = plugin.app;
	const file = app.vault.getFileByPath(req.baseFile);
	if (!(file instanceof TFile)) {
		new Notice(`Fileclass: base "${req.baseFile}" not found — the dependency was not written.`);
		return null;
	}

	// Bases keeps an open base's state in memory and would write over ours on
	// close; the sync path takes the same precaution.
	const openLeaves = openBaseLeaves(app, file.path);
	if (openLeaves.length) {
		if (!(await confirmCloseOpenBase(app, file.name))) {
			new Notice(`Fileclass: "${file.name}" is open — close it, then save the field again.`);
			return null;
		}
		await detachAndAwaitSave(app, file, openLeaves);
	}

	const spec = { source: req.source, sourceType: req.sourceType, match: req.match };
	const viewName = conditionalViewName({ ...spec, sourceView: req.sourceView });
	try {
		const base: unknown = parseYaml(await app.vault.read(file)) ?? {};
		const changed = ensureConditionalView(base, {
			sourceViewName: req.sourceView,
			formulaName: formulaName(spec),
			formula: matchFormula(spec),
			viewName,
		});
		if (!changed && !viewExists(base, viewName)) {
			// No source view to inherit from: the scope would be lost, so say so rather
			// than pointing the field at a view that offers the whole vault.
			new Notice(
				`Fileclass: view "${req.sourceView}" not found in ${file.name} — the dependency was not written.`
			);
			return null;
		}
		if (changed) {
			await app.vault.modify(file, stringifyYaml(base));
			new Notice(`Fileclass: "${viewName}" ready in ${file.name}.`);
		}
		return viewName;
	} catch (err) {
		new Notice(`Fileclass: could not update ${file.name} (${(err as Error).message}).`);
		return null;
	}
}
