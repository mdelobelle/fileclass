/*
 * Base sync (ARCHITECTURE.md §11) — one-way, explicit. A fileClass declares a
 * base (`baseFile`) and a managed view (`baseView`, default = the fileClass
 * name). Fileclass never writes the base on its own: it reports whether that
 * view still mirrors the fields (status), and re-applies the mirror only on an
 * explicit "Sync" (so base edits are never clobbered silently).
 *
 * The managed view is owned by Fileclass; all other views/filters/sorts in the
 * base are the user's and untouched. YAML round-trips via Obsidian's
 * parseYaml/stringifyYaml (no extra dep; reformats, drops comments).
 */
import { Notice, TFile, normalizePath, parseYaml, stringifyYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import { isRootField } from "../schema/field";
import { FileClassOptions, parseFileClass } from "../schema/fileClass";
import { buildBaseYaml, isBaseViewSynced, mirrorBaseView } from "./baseYaml";

export type BaseSyncStatus = "none" | "synced" | "diverged";

/** fileClass options read fresh from the note (the index is debounced). */
function liveOptions(plugin: FileclassPlugin, name: string): FileClassOptions | undefined {
	const file = plugin.index.getFileClassFile(name);
	if (!file) return undefined;
	return parseFileClass(name, plugin.app.metadataCache.getFileCache(file)?.frontmatter).options;
}

/** Managed view name for a fileClass (its `baseView`, else its own name). */
export function managedViewName(plugin: FileclassPlugin, name: string): string {
	return liveOptions(plugin, name)?.baseView?.trim() || name;
}

/** The fileClass's declared base file, if it is set and exists in the vault. */
export function fileClassBaseFile(plugin: FileclassPlugin, name: string): TFile | null {
	const baseFile = liveOptions(plugin, name)?.baseFile?.trim();
	if (!baseFile) return null;
	const file = plugin.app.vault.getFileByPath(normalizePath(baseFile));
	return file instanceof TFile ? file : null;
}

/** Opens the fileClass's base file in a new tab (Notice if none is set yet). */
export function openFileClassBase(plugin: FileclassPlugin, name: string): void {
	const file = fileClassBaseFile(plugin, name);
	if (!file) {
		new Notice(`Fileclass: "${name}" has no base yet.`);
		return;
	}
	void plugin.app.workspace.getLeaf("tab").openFile(file);
}

function rootFieldNames(plugin: FileclassPlugin, name: string): string[] {
	return plugin.index
		.getResolvedFields(name)
		.filter((f) => isRootField(f))
		.map((f) => f.name);
}

/** Reports whether the managed view still mirrors the fileClass's fields. */
export async function baseSyncStatus(plugin: FileclassPlugin, name: string): Promise<BaseSyncStatus> {
	const baseFile = liveOptions(plugin, name)?.baseFile?.trim();
	if (!baseFile) return "none";
	const file = plugin.app.vault.getFileByPath(normalizePath(baseFile));
	if (!(file instanceof TFile)) return "diverged"; // missing → needs sync (create)
	try {
		const base = parseYaml(await plugin.app.vault.read(file));
		return isBaseViewSynced(base, managedViewName(plugin, name), rootFieldNames(plugin, name))
			? "synced"
			: "diverged";
	} catch {
		return "diverged";
	}
}

/**
 * Applies the fileClass's fields to the managed view of `path` (creating the
 * base if missing). Takes `path`/`view` explicitly so callers that just wrote
 * the options don't depend on the (async) metadata cache being up to date.
 */
export async function applyBaseSync(
	plugin: FileclassPlugin,
	name: string,
	path: string,
	view: string
): Promise<void> {
	const app = plugin.app;
	const fields = rootFieldNames(plugin, name);
	const file = app.vault.getFileByPath(path);

	if (!(file instanceof TFile)) {
		await ensureParentFolder(plugin, path);
		await app.vault.create(path, buildBaseYaml(name, fields, plugin.settings.fileClassAlias, view));
		new Notice(`Fileclass: created ${path}`);
		return;
	}

	const base = parseYaml(await app.vault.read(file));
	if (mirrorBaseView(base, view, fields)) {
		await app.vault.modify(file, stringifyYaml(base));
	}
	new Notice(`Fileclass: synced ${path}`);
}

/**
 * Re-applies the mirror using the fileClass's saved options (creating the base
 * if missing). One-way; returns true on success.
 */
export async function syncFileClassToBase(plugin: FileclassPlugin, name: string): Promise<boolean> {
	const baseFile = liveOptions(plugin, name)?.baseFile?.trim();
	if (!baseFile) {
		new Notice("Fileclass: no base is set for this fileClass.");
		return false;
	}
	await applyBaseSync(plugin, name, normalizePath(baseFile), managedViewName(plugin, name));
	return true;
}

async function ensureParentFolder(plugin: FileclassPlugin, path: string): Promise<void> {
	const parent = path.split("/").slice(0, -1).join("/");
	if (!parent || plugin.app.vault.getFolderByPath(parent)) return;
	try {
		await plugin.app.vault.createFolder(parent);
	} catch {
		/* already exists (race) */
	}
}
