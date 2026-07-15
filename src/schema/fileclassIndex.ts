/*
 * FileclassIndex (ARCHITECTURE.md §10). The slim successor of Metadata Menu's
 * FieldIndex, keeping only: the fileClass registry (parsed notes under
 * classFilesPath), ancestors, resolved fields per class, and the file→fileClass
 * binding maps. Frontmatter-only reads (D2); no dataview, no IndexedDB.
 *
 * Rebuild is driven by main.ts (debounced metadataCache 'resolved' + fileClass
 * file changes). On each rebuild it fires the `fileclass:indexed` event.
 */
import { App, Events, TFile, getAllTags } from "obsidian";

import { FileclassSettings } from "../settings/settings";
import { Field } from "./field";
import {
	fileClassNameFromPath,
	ParsedFileClass,
	parseFileClass,
	toStringArray,
} from "./fileClass";
import { computeAncestors, resolveInheritedFields } from "./inheritance";
import { FileBinding, FileClassRegistry, resolveBinding, Resolution } from "./resolver";

/** Minimal host contract (satisfied structurally by the plugin instance). */
export interface IndexHost {
	app: App;
	settings: FileclassSettings;
}

export const INDEXED_EVENT = "fileclass:indexed";

export class FileclassIndex extends Events {
	private byName = new Map<string, ParsedFileClass>();
	private nameByPath = new Map<string, string>();
	private ancestorsByName = new Map<string, string[]>();
	private fieldsByName = new Map<string, Field[]>();
	private tagBindings = new Map<string, string>();
	private pathBindings = new Map<string, string>();
	private bookmarkBindings = new Map<string, string>();
	/** Aggregated non-fatal parse problems from the last rebuild. */
	errors: string[] = [];

	constructor(private readonly host: IndexHost) {
		super();
	}

	private get app(): App {
		return this.host.app;
	}

	// -- rebuild --------------------------------------------------------------

	/** Rescans the class-files folder and recomputes every derived map. */
	rebuild(): void {
		this.clear();
		const classFilesPath = this.host.settings.classFilesPath;
		if (classFilesPath) {
			const files = this.app.vault
				.getMarkdownFiles()
				.filter((f) => f.path.startsWith(classFilesPath));
			for (const file of files) this.indexFileClassNote(file);
			this.computeInheritance();
			this.buildBindingMaps();
		}
		// Notify our own listeners and the workspace (external consumers).
		this.trigger(INDEXED_EVENT);
		this.app.workspace.trigger(INDEXED_EVENT);
	}

	private clear(): void {
		this.byName.clear();
		this.nameByPath.clear();
		this.ancestorsByName.clear();
		this.fieldsByName.clear();
		this.tagBindings.clear();
		this.pathBindings.clear();
		this.bookmarkBindings.clear();
		this.errors = [];
	}

	private indexFileClassNote(file: TFile): void {
		const name = fileClassNameFromPath(this.host.settings.classFilesPath, file.path);
		if (!name) return;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const parsed = parseFileClass(name, frontmatter);
		this.byName.set(name, parsed);
		this.nameByPath.set(file.path, name);
		if (parsed.errors.length) this.errors.push(...parsed.errors);
	}

	private computeInheritance(): void {
		const parentOf = (n: string) => this.byName.get(n)?.options.extends;
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

	/** A read-only registry view for the pure resolver. */
	registry(): FileClassRegistry {
		const global = this.host.settings.globalFileClass || undefined;
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
		const innerNames = toStringArray(cache?.frontmatter?.[alias]);
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

	getResolvedFields(name: string): Field[] {
		return this.fieldsByName.get(name) ?? [];
	}

	/** True when `path` is a fileClass note (under the class-files folder). */
	isFileClassNote(path: string): boolean {
		return this.nameByPath.has(path);
	}
}
