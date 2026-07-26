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
import {
	App,
	Modal,
	Notice,
	Setting,
	TFile,
	WorkspaceLeaf,
	normalizePath,
	parseYaml,
	stringifyYaml,
} from "obsidian";

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
		const base: unknown = parseYaml(await plugin.app.vault.read(file));
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
	const alias = plugin.settings.fileClassAlias;
	const file = app.vault.getFileByPath(path);

	if (!(file instanceof TFile)) {
		await ensureParentFolder(plugin, path);
		await app.vault.create(path, buildBaseYaml(name, fields, alias, view));
		new Notice(`Fileclass: created ${path}`);
		return;
	}

	// Edge case: a freshly created base is open in a tab whose in-memory layout
	// hasn't been written to disk yet, so the file reads empty. Syncing would
	// read stale content and silently no-op (and a later close would clobber our
	// write). Offer to close it so Bases flushes its state, then continue.
	const openLeaves = openBaseLeaves(app, file.path);
	if (openLeaves.length) {
		if (!(await confirmCloseOpenBase(app, file.name))) {
			new Notice(`Fileclass: "${file.name}" is open — close it, then sync.`);
			return;
		}
		await detachAndAwaitSave(app, file, openLeaves);
	}

	const base: unknown = parseYaml(await app.vault.read(file));
	// Empty or malformed on disk (no views): initialize a full base rather than
	// silently doing nothing.
	if (!isBaseWithViews(base)) {
		await app.vault.modify(file, buildBaseYaml(name, fields, alias, view));
		new Notice(`Fileclass: initialized ${path}`);
		return;
	}
	if (mirrorBaseView(base, view, fields, name, alias)) {
		await app.vault.modify(file, stringifyYaml(base));
	}
	new Notice(`Fileclass: synced ${path}`);
}

/** True when the parsed base is an object carrying a `views` array. */
function isBaseWithViews(base: unknown): boolean {
	return (
		typeof base === "object" &&
		base !== null &&
		Array.isArray((base as { views?: unknown }).views)
	);
}

/** Leaves currently displaying the .base at `path` (any registered view type). */
function openBaseLeaves(app: App, path: string): WorkspaceLeaf[] {
	const leaves: WorkspaceLeaf[] = [];
	app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.getViewState().state?.file === path) leaves.push(leaf);
	});
	return leaves;
}

/**
 * Closes `leaves` and waits until the base file is (re)written to disk — closing
 * a Bases leaf flushes its in-memory layout. Resolves on the first `modify` of
 * the file, or after a short timeout so a no-op close can't hang the sync.
 */
function detachAndAwaitSave(app: App, file: TFile, leaves: WorkspaceLeaf[]): Promise<void> {
	return new Promise((resolve) => {
		let done = false;
		const finish = (): void => {
			if (done) return;
			done = true;
			app.vault.offref(ref);
			window.clearTimeout(timer);
			resolve();
		};
		const ref = app.vault.on("modify", (f) => {
			if (f.path === file.path) finish();
		});
		const timer = window.setTimeout(finish, 1500);
		for (const leaf of leaves) leaf.detach();
	});
}

/** Confirms closing an open base before syncing. Resolves true on confirm. */
function confirmCloseOpenBase(app: App, fileName: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText("Base is open");
		modal.contentEl.createEl("p", {
			text: `"${fileName}" is open in a tab and its layout may not be saved to disk yet. Close it and sync now?`,
		});
		let confirmed = false;
		new Setting(modal.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => modal.close()))
			.addButton((b) =>
				b
					.setButtonText("Close base & sync")
					.setCta()
					.onClick(() => {
						confirmed = true;
						modal.close();
					})
			);
		modal.onClose = (): void => {
			modal.contentEl.empty();
			resolve(confirmed);
		};
		modal.open();
	});
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
