/*
 * Reading the vault's fileClasses into a schema canvas, and writing it (#149).
 *
 * The rules live next door in `schemaCanvas.ts`, which touches no Obsidian API and is where the
 * tests are. This module does the three impure things: collect the classes, decide whether a
 * sync has anything to do, and write the file — including the dance for a canvas the reader
 * happens to have open, which Obsidian would otherwise overwrite from its in-memory copy.
 *
 * Sync is **explicit**, like `baseSync` and unlike the Canvas engine: this file is arranged by
 * hand, so writing it unasked is the clobber scenario the whole design avoids.
 */
import { Notice, TFile, TFolder, normalizePath } from "obsidian";

import type FileclassPlugin from "../../main";
import { baseBindingOptionsFromOptions, canvasOptions, listOptionsFromOptions } from "../fields/options";
import { FieldType, isRootField } from "../schema/field";
import { CanvasDoc, SchemaClass, desiredSchemaCanvas, reconcileSchemaCanvas } from "./schemaCanvas";

/** Field types whose candidates come from a `.base` view. */
const LINK_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["File", "MultiFile", "Media", "MultiMedia"]);
/** Field types whose *values* may come from a `.base` view (§5). */
const LIST_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Select", "Cycle", "Multi"]);
/** Field types fed by a `.canvas`. */
const CANVAS_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Canvas", "CanvasGroup", "CanvasGroupLink"]);

/** Where the schema canvas lives: the setting, or `<class folder>/Schema.canvas`. */
export function schemaCanvasPath(plugin: FileclassPlugin): string {
	const configured = plugin.settings.schemaCanvasPath?.trim();
	if (configured) return normalizePath(configured.endsWith(".canvas") ? configured : `${configured}.canvas`);
	const folder = plugin.settings.classFilesPath.replace(/\/+$/, "");
	return normalizePath(folder ? `${folder}/Schema.canvas` : "Schema.canvas");
}

/**
 * The classes as the diagram needs them.
 *
 * Own fields only — an inherited field's base dependency belongs to the class that declared it,
 * and drawing it again on every child would turn one relation into a fan.
 */
export function collectSchemaClasses(plugin: FileclassPlugin): SchemaClass[] {
	const out: SchemaClass[] = [];
	for (const name of [...plugin.index.fileClassNames].sort((a, b) => a.localeCompare(b))) {
		const parsed = plugin.index.getFileClass(name);
		const file = plugin.index.getFileClassFile(name);
		if (!parsed || !file) continue;
		const bases = new Map<string, "values" | "candidates">();
		const canvases = new Set<string>();
		// Every field, nested ones included: a child of an Object can point at a base too.
		for (const field of parsed.fields) {
			if (LINK_TYPES.has(field.type)) {
				const path = baseBindingOptionsFromOptions(field.options).baseFile;
				if (path) bases.set(normalizePath(path), "candidates");
			} else if (LIST_TYPES.has(field.type)) {
				const list = listOptionsFromOptions(field.options);
				// A values list can come from a base too, and hiding that would let the diagram
				// claim to show base dependencies while missing some.
				if (list.sourceType === "ValuesFromBase" && list.baseFile) {
					bases.set(normalizePath(list.baseFile), "values");
				}
			} else if (CANVAS_TYPES.has(field.type)) {
				const path = canvasOptions(field).canvasPath;
				if (path) canvases.add(normalizePath(path));
			}
		}
		// Root fields in declaration order, with a count for what an Object holds: a schema read
		// at a glance, not a full expansion of every nested field.
		const roots = parsed.fields.filter((f) => isRootField(f));
		const childCount = (id: string): number =>
			parsed.fields.filter((f) => f.path.split("____").includes(id)).length;
		out.push({
			name,
			path: file.path,
			fields: roots.map((f) => ({
				name: f.name,
				type: f.type,
				nested: f.type === "Object" || f.type === "ObjectList" ? childCount(f.id) : undefined,
			})),
			extends: parsed.options.extends,
			excludes: parsed.options.excludes,
			mapWithTag: parsed.options.mapWithTag,
			tagNames: parsed.options.tagNames,
			filesPaths: parsed.options.filesPaths,
			bookmarksGroups: parsed.options.bookmarksGroups,
			baseDeps: [...bases].map(([path, kind]) => ({ path, kind })),
			canvasDeps: [...canvases],
		});
	}
	return out;
}

/** Obsidian's canvas view, in the two calls this module needs. */
interface CanvasLeafView {
	getViewData?(): string;
	setViewData?(data: string, clear: boolean): void;
	requestSave?(): void;
}

/** The leaf showing `path`, if the reader has it open. */
function openCanvasView(plugin: FileclassPlugin, path: string): CanvasLeafView | null {
	for (const leaf of plugin.app.workspace.getLeavesOfType("canvas")) {
		const state = leaf.getViewState().state as { file?: string } | undefined;
		if (state?.file === path) return leaf.view as unknown as CanvasLeafView;
	}
	return null;
}

function parseCanvasDoc(raw: string): CanvasDoc | null {
	try {
		const doc = JSON.parse(raw) as Partial<CanvasDoc>;
		return { nodes: Array.isArray(doc.nodes) ? doc.nodes : [], edges: Array.isArray(doc.edges) ? doc.edges : [] };
	} catch {
		// A canvas we cannot parse is not a canvas we may overwrite silently.
		return null;
	}
}

/**
 * The canvas as it stands — from the **open view** when there is one, otherwise from disk.
 *
 * A canvas open in a leaf keeps its state in memory and writes it back on its own schedule, so
 * disk is the stale copy: reconciling against it would undo moves the reader just made. Measured
 * on 1.13.2: `getViewData()` returns the live document, and `setViewData` + `requestSave` write
 * through the view — the file changes and the diagram redraws, with nothing to close.
 */
async function readCanvas(plugin: FileclassPlugin, path: string): Promise<CanvasDoc | null> {
	const view = openCanvasView(plugin, path);
	const live = view?.getViewData?.();
	if (typeof live === "string") return parseCanvasDoc(live);
	const file = plugin.app.vault.getFileByPath(path);
	if (!(file instanceof TFile)) return null;
	return parseCanvasDoc(await plugin.app.vault.read(file));
}

export type SchemaCanvasStatus = "missing" | "in-sync" | "drifted";

/** Whether a sync would change anything — the same question `baseSyncStatus` answers for a base. */
export async function schemaCanvasStatus(plugin: FileclassPlugin): Promise<SchemaCanvasStatus> {
	const path = schemaCanvasPath(plugin);
	const existing = await readCanvas(plugin, path);
	if (!existing) return "missing";
	const desired = desiredSchemaCanvas(collectSchemaClasses(plugin));
	const { added, removed, updated } = reconcileSchemaCanvas(existing, desired);
	return added.length || removed.length || updated.length ? "drifted" : "in-sync";
}

/**
 * Writes the schema canvas, keeping every arrangement it finds.
 *
 * A canvas open in a leaf holds its state in memory and writes it back over ours — the same
 * hazard `baseSync` met with bases, answered with the same machinery: ask, close, wait for its
 * own save, then write.
 */
export async function syncSchemaCanvas(plugin: FileclassPlugin): Promise<void> {
	const app = plugin.app;
	const path = schemaCanvasPath(plugin);
	const classes = collectSchemaClasses(plugin);
	if (!classes.length) {
		new Notice("Fileclass: no fileClass to draw yet.");
		return;
	}

	const existing = await readCanvas(plugin, path);
	const file = app.vault.getFileByPath(path);
	if (file instanceof TFile && !existing) {
		new Notice(`Fileclass: ${path} is not readable as a canvas — nothing written.`);
		return;
	}

	const { doc, added, removed, updated } = reconcileSchemaCanvas(existing, desiredSchemaCanvas(classes));
	const body = `${JSON.stringify(doc, null, 2)}\n`;

	if (file instanceof TFile) {
		if (!added.length && !removed.length && !updated.length) {
			new Notice(`Fileclass: ${path} already matches your classes.`);
			return;
		}
		// Through the view when it is open, so the diagram redraws and nothing has to be closed.
		const view = openCanvasView(plugin, path);
		if (view?.setViewData) {
			view.setViewData(body, false);
			view.requestSave?.();
		} else {
			await app.vault.modify(file, body);
		}
	} else {
		const parent = path.split("/").slice(0, -1).join("/");
		if (parent && !app.vault.getFolderByPath(parent)) {
			await app.vault.createFolder(parent).catch(() => undefined);
		}
		await app.vault.create(path, body);
	}

	const parts = [
		added.length ? `${added.length} added` : "",
		updated.length ? `${updated.length} updated` : "",
		removed.length ? `${removed.length} removed` : "",
	].filter(Boolean);
	new Notice(
		file instanceof TFile
			? `Fileclass: synced ${path} (${parts.join(", ")}).`
			: `Fileclass: drew ${classes.length} fileClass(es) into ${path}.`
	);
	// Opened only when it did not exist a moment ago: a resync should not steal the tab you
	// were reading, and the open view has already redrawn itself.
	if (!(file instanceof TFile)) {
		const written = app.vault.getFileByPath(path);
		if (written instanceof TFile) await app.workspace.getLeaf(false).openFile(written);
	}
}

/** True when `file` is the schema canvas — the Canvas engine has no business reading it. */
export function isSchemaCanvas(plugin: FileclassPlugin, path: string): boolean {
	return normalizePath(path) === schemaCanvasPath(plugin);
}

/** The class folder, for the context-menu entry that offers this on it. */
export function isClassFolder(plugin: FileclassPlugin, folder: TFolder): boolean {
	const configured = plugin.settings.classFilesPath.replace(/\/+$/, "");
	return !!configured && normalizePath(folder.path) === normalizePath(configured);
}
