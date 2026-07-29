/*
 * FileclassIndex (ARCHITECTURE.md §10). The slim successor of Metadata Menu's
 * FieldIndex, keeping only: the fileClass registry (parsed notes under
 * classFilesPath), ancestors, resolved fields per class, and the file→fileClass
 * binding maps. Frontmatter-only reads (D2); no dataview, no IndexedDB.
 *
 * Rebuild is driven by main.ts (debounced metadataCache 'resolved' + fileClass
 * file changes). On each rebuild it fires the `fileclass:indexed` event.
 */
import { App, Events, TFile, getAllTags, parseYaml } from "obsidian";

import { FileclassSettings } from "../settings/settings";
import { FILECLASS_EXTENSION, FILECLASS_NAME_SUFFIX } from "./constants";
import { Field } from "./field";
import { fileClassNameFromFile, ParsedFileClass, parseFileClass } from "./fileClass";
import { splitFileClassSource } from "./fileClassSource";
import { computeAncestors, resolveInheritedFields } from "./inheritance";
import {
	FileBinding,
	FileClassRegistry,
	resolveBinding,
	resolveExtendsName,
	resolveInnerFileClassNames,
	Resolution,
} from "./resolver";

/** Minimal host contract (satisfied structurally by the plugin instance). */
export interface IndexHost {
	app: App;
	settings: FileclassSettings;
}

export const INDEXED_EVENT = "fileclass:indexed";

export class FileclassIndex extends Events {
	private byName = new Map<string, ParsedFileClass>();
	private nameByPath = new Map<string, string>();
	private pathByName = new Map<string, string>();
	private ancestorsByName = new Map<string, string[]>();
	private fieldsByName = new Map<string, Field[]>();
	private tagBindings = new Map<string, string>();
	private pathBindings = new Map<string, string>();
	private bookmarkBindings = new Map<string, string>();
	/** Aggregated non-fatal parse problems from the last rebuild. */
	errors: string[] = [];
	// Rebuild is async (non-md reads); serialize overlapping calls and coalesce a
	// trailing one so `clear()` never interleaves with an in-flight population.
	private rebuildInFlight: Promise<void> | null = null;
	private rebuildQueued = false;

	constructor(private readonly host: IndexHost) {
		super();
	}

	private get app(): App {
		return this.host.app;
	}

	// -- rebuild --------------------------------------------------------------

	/**
	 * Rescans every `.fileclass` definition file vault-wide and recomputes derived
	 * maps. Async because `.fileclass` files are not markdown, so their schema is
	 * read via `vault.cachedRead` rather than the metadata cache. Overlapping calls
	 * are serialized (and a burst coalesced to one trailing run) so a concurrent
	 * `clear()` can never wipe an in-flight population.
	 */
	rebuild(): Promise<void> {
		if (this.rebuildInFlight) {
			this.rebuildQueued = true;
			return this.rebuildInFlight;
		}
		this.rebuildInFlight = this.runRebuild().finally(() => {
			this.rebuildInFlight = null;
			if (this.rebuildQueued) {
				this.rebuildQueued = false;
				void this.rebuild();
			}
		});
		return this.rebuildInFlight;
	}

	private async runRebuild(): Promise<void> {
		this.clear();
		const files = this.app.vault.getFiles().filter((f) => f.extension === FILECLASS_EXTENSION);
		for (const file of files) await this.indexFileClassNote(file);
		this.computeInheritance();
		this.buildBindingMaps();
		// Notify our own listeners and the workspace (external consumers).
		this.trigger(INDEXED_EVENT);
		this.app.workspace.trigger(INDEXED_EVENT);
	}

	private clear(): void {
		this.byName.clear();
		this.nameByPath.clear();
		this.pathByName.clear();
		this.ancestorsByName.clear();
		this.fieldsByName.clear();
		this.tagBindings.clear();
		this.pathBindings.clear();
		this.bookmarkBindings.clear();
		this.errors = [];
	}

	private async indexFileClassNote(file: TFile): Promise<void> {
		const name = fileClassNameFromFile(file);
		if (!name) return;
		// Vault-wide discovery is name-keyed (registry keys carry no folder), so two
		// same-named `.fileclass` files collide; last-in wins. Surface it rather than
		// silently shadowing (a naming-convention responsibility).
		const prior = this.pathByName.get(name);
		if (prior && prior !== file.path) {
			this.errors.push(`Duplicate fileClass "${name}": ${file.path} shadows ${prior}.`);
		}
		// `.fileclass` is not markdown, so parse the YAML block from the raw text.
		const raw = await this.app.vault.cachedRead(file);
		const { frontmatter } = splitFileClassSource(raw);
		let fm: Record<string, unknown> = {};
		if (frontmatter.trim()) {
			try {
				const y: unknown = parseYaml(frontmatter);
				if (y && typeof y === "object") fm = y as Record<string, unknown>;
			} catch (e) {
				this.errors.push(`Malformed YAML in ${file.path}: ${(e as Error).message}`);
			}
		}
		const parsed = parseFileClass(name, fm);
		this.byName.set(name, parsed);
		this.nameByPath.set(file.path, name);
		this.pathByName.set(name, file.path);
		if (parsed.errors.length) this.errors.push(...parsed.errors);
	}

	private computeInheritance(): void {
		// `extends` may be a wikilink (`"[[Note.fileclass]]"`) or a bare/display
		// name; resolve each to a canonical registry name once, up front.
		const resolvedParent = new Map<string, string | undefined>();
		for (const name of this.byName.keys()) {
			const raw = this.byName.get(name)?.options.extends;
			const sourcePath = this.pathByName.get(name) ?? "";
			resolvedParent.set(
				name,
				resolveExtendsName(
					raw,
					(link) => {
						const dest = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
						return dest ? this.nameByPath.get(dest.path) : undefined;
					},
					(n) => this.byName.has(n)
				)
			);
		}
		const parentOf = (n: string) => resolvedParent.get(n);
		for (const name of this.byName.keys()) {
			const ancestors = computeAncestors(name, parentOf);
			this.ancestorsByName.set(name, ancestors);
			const fields = resolveInheritedFields(
				name,
				ancestors,
				(cls) => this.byName.get(cls)?.fields ?? [],
				(cls) => this.byName.get(cls)?.options.excludes ?? []
			);
			this.fieldsByName.set(name, fields);
		}
	}

	private buildBindingMaps(): void {
		for (const [name, parsed] of this.byName) {
			const { mapWithTag, tagNames, filesPaths, bookmarksGroups } = parsed.options;
			// mapWithTag → the fileClass name itself is the tag (single-word only).
			if (mapWithTag && !name.includes(" ")) this.tagBindings.set(name, name);
			for (const tag of tagNames) if (!tag.includes(" ")) this.tagBindings.set(tag, name);
			for (const path of filesPaths) this.pathBindings.set(path, name);
			for (const group of bookmarksGroups) this.bookmarkBindings.set(group, name);
		}
	}

	// -- registry / resolution ------------------------------------------------

	/**
	 * Resolves the Global fileClass setting to an indexed name. The setting may be
	 * a bare name, a `.fileclass` name, or a path (legacy `classFilesPath` value);
	 * fileClass names now carry the `.fileclass` suffix, so match forgivingly.
	 */
	private resolveGlobalName(): string | undefined {
		const raw = this.host.settings.globalFileClass;
		if (!raw) return undefined;
		const base = (raw.split("/").pop() ?? raw).replace(/\.md$/, "");
		for (const cand of [raw, base, `${base}${FILECLASS_NAME_SUFFIX}`]) {
			if (this.byName.has(cand)) return cand;
		}
		return undefined;
	}

	/** A read-only registry view for the pure resolver. */
	registry(): FileClassRegistry {
		const global = this.resolveGlobalName();
		return {
			has: (name) => this.byName.has(name),
			fieldsOf: (name) => this.fieldsByName.get(name) ?? [],
			tagBindings: this.tagBindings,
			pathBindings: this.pathBindings,
			bookmarkBindings: this.bookmarkBindings,
			globalFileClass: global,
			// presetFields: wired in a later phase (settings.presetFields).
		};
	}

	/** Builds a note's binding context from its metadata cache entry. */
	bindingFor(file: TFile): FileBinding {
		const cache = this.app.metadataCache.getFileCache(file);
		const alias = this.host.settings.fileClassAlias;
		const innerNames = resolveInnerFileClassNames(
			cache?.frontmatterLinks ?? [],
			alias,
			(link) => this.app.metadataCache.getFirstLinkpathDest(link, file.path)?.path ?? null,
			this.nameByPath
		);
		const tags = (cache ? getAllTags(cache) ?? [] : []).map((t) => t.replace(/^#/, ""));
		return { innerNames, tags, folderPath: file.parent?.path ?? "" };
	}

	/** Full binding resolution for a note (fileClasses + merged fields). */
	resolve(file: TFile): Resolution {
		return resolveBinding(this.bindingFor(file), this.registry());
	}

	getFileClasses(file: TFile): string[] {
		return this.resolve(file).fileClassNames;
	}

	getFields(file: TFile): Field[] {
		return this.resolve(file).fields;
	}

	// -- accessors ------------------------------------------------------------

	get fileClassNames(): string[] {
		return [...this.byName.keys()];
	}

	getFileClass(name: string): ParsedFileClass | undefined {
		return this.byName.get(name);
	}

	getAncestors(name: string): string[] {
		return this.ancestorsByName.get(name) ?? [];
	}

	/** Resolved Lucide icon name for a fileClass: its own `icon`, else an
	 * ancestor's, else the configured default. */
	resolveIcon(name: string): string {
		for (const cls of [name, ...this.getAncestors(name)]) {
			const icon = this.byName.get(cls)?.options.icon;
			if (icon) return icon;
		}
		return this.host.settings.fileClassIcon;
	}

	/** Icon for a note, from its primary (first-bound) fileClass. */
	iconForFile(file: TFile): string {
		const names = this.getFileClasses(file);
		return names.length ? this.resolveIcon(names[0]) : this.host.settings.fileClassIcon;
	}

	getResolvedFields(name: string): Field[] {
		return this.fieldsByName.get(name) ?? [];
	}

	/** True when `path` is a fileClass note (under the class-files folder). */
	isFileClassNote(path: string): boolean {
		return this.nameByPath.has(path);
	}

	/** fileClass name for a note path, if it is a fileClass note. */
	fileClassNameOfNote(path: string): string | undefined {
		return this.nameByPath.get(path);
	}

	/** The Markdown note backing a fileClass, resolved by its indexed path. */
	getFileClassFile(name: string): TFile | null {
		const path = this.pathByName.get(name);
		if (path) {
			const file = this.app.vault.getFileByPath(path);
			if (file instanceof TFile) return file;
		}
		// Not yet indexed (e.g. a class created just now, before the debounced
		// rebuild fires) — fall back to a direct vault lookup by filename.
		const match = this.app.vault
			.getFiles()
			.find((f) => f.extension === FILECLASS_EXTENSION && f.name === name);
		return match ?? null;
	}
}
