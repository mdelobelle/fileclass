/*
 * Canvas engine (ARCHITECTURE.md §9.1). Watches `.canvas` files and derives the
 * value of Canvas / CanvasGroup / CanvasGroupLink fields on the notes that
 * appear as file-nodes, writing the result back to frontmatter (D5, single
 * write per note). No Dataview: the graph traversal is the pure canvasGraph.
 *
 * This is the only surface that *auto-writes* frontmatter. It is deterministic
 * and diff-guarded (a note is written only when its computed value changed), so
 * re-indexing after a write settles without a loop. Feature-detected via a
 * setting; a malformed canvas yields an empty graph rather than throwing.
 */
import { Component, TFile, debounce } from "obsidian";

import type FileclassPlugin from "../../../main";
import { getBaseFiles } from "../../engine/basesAdapter";
import { readFieldValue } from "../../io/read";
import { ValueWrite, writeValues } from "../../io/write";
import { Field, FieldType } from "../../schema/field";
import { INDEXED_EVENT } from "../../schema/fileclassIndex";
import { canvasOptions, CanvasOptions } from "../options";
import {
	CanvasData,
	CanvasFileRef,
	CanvasNode,
	parseCanvas,
	resolveGroupLabels,
	resolveGroupLinkedFiles,
	resolveLinkedFiles,
} from "./canvasGraph";

const CANVAS_TYPES = new Set<FieldType>(["Canvas", "CanvasGroup", "CanvasGroupLink"]);

export class CanvasEngine extends Component {
	/** canvasPath → note paths written on the last run (for drop-out cleanup). */
	private lastNotes = new Map<string, Set<string>>();
	private dirty = new Set<string>();
	private flush: () => void = () => undefined;

	constructor(private readonly plugin: FileclassPlugin) {
		super();
	}

	onload(): void {
		this.flush = debounce(() => void this.flushDirty(), 150, true);
		const vault = this.plugin.app.vault;
		this.registerEvent(vault.on("modify", (f) => this.mark(f)));
		this.registerEvent(vault.on("create", (f) => this.mark(f)));
		this.registerEvent(vault.on("delete", (f) => this.mark(f)));
		this.registerEvent(
			vault.on("rename", (f, oldPath) => {
				if (this.isCanvas(f)) {
					this.dirty.add(oldPath);
					this.mark(f);
				}
			})
		);
		// A note may gain/lose a Canvas binding when a fileClass changes.
		this.registerEvent(this.plugin.index.on(INDEXED_EVENT, () => this.syncAll()));
		// Obsidian doesn't live-refresh a canvas file-node's rendered properties
		// when the note changes on disk (e.g. our own writes). Reload the node.
		this.registerEvent(
			this.plugin.app.metadataCache.on("changed", (f) => {
				if (this.plugin.settings.enableCanvasEngine) this.refreshCanvasNodes(f.path);
			})
		);
	}

	private isCanvas(f: unknown): f is TFile {
		return f instanceof TFile && f.extension === "canvas";
	}

	private mark(f: unknown): void {
		if (!this.plugin.settings.enableCanvasEngine) return;
		if (this.isCanvas(f)) {
			this.dirty.add(f.path);
			this.flush();
		}
	}

	/** Queues every canvas file (e.g. after a re-index). */
	private syncAll(): void {
		if (!this.plugin.settings.enableCanvasEngine) return;
		for (const f of this.plugin.app.vault.getFiles()) {
			if (f.extension === "canvas") this.dirty.add(f.path);
		}
		this.flush();
	}

	private async flushDirty(): Promise<void> {
		const paths = [...this.dirty];
		this.dirty.clear();
		for (const path of paths) await this.syncCanvas(path);
	}

	private async syncCanvas(canvasPath: string): Promise<void> {
		const app = this.plugin.app;
		const canvasFile = app.vault.getFileByPath(canvasPath);
		const data: CanvasData =
			canvasFile instanceof TFile ? parseCanvas(await app.vault.read(canvasFile)) : { nodes: [], edges: [] };

		const written = new Set<string>();
		for (const node of data.nodes) {
			if (node.type !== "file" || !node.file) continue;
			const note = app.vault.getFileByPath(node.file);
			if (!(note instanceof TFile)) continue;
			const fields = this.canvasFields(note, canvasPath);
			if (!fields.length) continue;
			written.add(note.path);
			const writes = await this.writesForNote(note, node, data, fields);
			if (writes.length) await writeValues(app, note, writes);
		}

		await this.clearDroppedNotes(canvasPath, written);
		this.lastNotes.set(canvasPath, written);
	}

	/** Canvas-family fields of `note` bound to this canvas. */
	private canvasFields(note: TFile, canvasPath: string): Field[] {
		return this.plugin.index
			.getFields(note)
			.filter((f) => CANVAS_TYPES.has(f.type) && canvasOptions(f).canvasPath === canvasPath);
	}

	private async writesForNote(
		note: TFile,
		node: CanvasNode,
		data: CanvasData,
		fields: Field[]
	): Promise<ValueWrite[]> {
		const writes: ValueWrite[] = [];
		for (const field of fields) {
			const opts = canvasOptions(field);
			let value: unknown;
			// When nothing matches, set the field to null (keep the key) rather
			// than removing it, so the binding stays visible on the note.
			if (field.type === "CanvasGroup") {
				const labels = resolveGroupLabels(node, data, opts);
				value = labels.length ? labels : null;
			} else {
				const matchingFiles = await this.matchingFiles(note, opts);
				const linkOpts = { ...opts, matchingFiles };
				const refs =
					field.type === "CanvasGroupLink"
						? resolveGroupLinkedFiles(node, data, linkOpts)
						: resolveLinkedFiles(node, data, linkOpts);
				const links = refs.map((r) => this.toLink(note.path, r));
				value = links.length ? links : null;
			}
			if (!this.equalValue(readFieldValue(this.plugin.app, note, field), value)) {
				writes.push({ namePath: [field.name], value });
			}
		}
		return writes;
	}

	/** The set of note paths in the field's "matching files" base view, if any. */
	private async matchingFiles(
		note: TFile,
		opts: CanvasOptions
	): Promise<Set<string> | undefined> {
		if (!opts.matchingFilesBase || !this.plugin.basesAvailable) return undefined;
		try {
			const files = await getBaseFiles(
				this.plugin.app,
				opts.matchingFilesBase,
				opts.matchingFilesView,
				note.path
			);
			return new Set(files.map((f) => f.path));
		} catch {
			return undefined; // unreadable base → don't restrict
		}
	}

	/** Notes that were connected last run but no longer are → clear their fields. */
	private async clearDroppedNotes(canvasPath: string, written: Set<string>): Promise<void> {
		const previous = this.lastNotes.get(canvasPath);
		if (!previous) return;
		for (const notePath of previous) {
			if (written.has(notePath)) continue;
			const note = this.plugin.app.vault.getFileByPath(notePath);
			if (!(note instanceof TFile)) continue;
			const writes = this.canvasFields(note, canvasPath)
				.filter((f) => this.norm(readFieldValue(this.plugin.app, note, f)).length > 0)
				.map((f) => ({ namePath: [f.name], value: null }));
			if (writes.length) await writeValues(this.plugin.app, note, writes);
		}
	}

	private toLink(sourcePath: string, ref: CanvasFileRef): string {
		const target = this.plugin.app.vault.getFileByPath(ref.file);
		if (target instanceof TFile) {
			return this.plugin.app.fileManager.generateMarkdownLink(target, sourcePath, ref.subpath);
		}
		const base = ref.file.replace(/\.md$/, "");
		return `[[${base}${ref.subpath ?? ""}]]`;
	}

	private equalValue(a: unknown, b: unknown): boolean {
		const na = this.norm(a);
		const nb = this.norm(b);
		return na.length === nb.length && na.every((v, i) => v === nb[i]);
	}

	private norm(value: unknown): string[] {
		if (value === undefined || value === null || value === "") return [];
		return (Array.isArray(value) ? value : [value]).map(String);
	}

	/**
	 * Reloads the rendered card of any open-canvas file-node backing `path`.
	 * Verified live (Obsidian 1.13.2): the node's child exposes `loadFile()`,
	 * which re-reads the file and repaints its properties. Private API — every
	 * access is structurally typed and guarded, so a future drift just no-ops.
	 */
	private refreshCanvasNodes(path: string): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("canvas")) {
			const canvas = (leaf.view as unknown as CanvasViewLike).canvas;
			const nodes = canvas?.nodes;
			if (!nodes) continue;
			try {
				for (const node of nodes.values()) {
					const nodePath = node.filePath ?? node.file?.path;
					if (nodePath === path) node.child?.loadFile?.();
				}
			} catch {
				/* canvas internals drifted — refresh is best-effort */
			}
		}
	}
}

/** Structural view of the private canvas internals we reach into. */
interface CanvasNodeLike {
	filePath?: string;
	file?: { path: string };
	child?: { loadFile?: () => unknown };
}
interface CanvasViewLike {
	canvas?: { nodes?: Map<unknown, CanvasNodeLike> };
}
