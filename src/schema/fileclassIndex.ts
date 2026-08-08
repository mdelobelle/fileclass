/*
 * FileclassIndex (ARCHITECTURE.md §10). The slim successor of Metadata Menu's
 * FieldIndex, keeping only: the fileClass registry (parsed notes under
 * classFilesPath), ancestors, resolved fields per class, and the file→fileClass
 * binding maps. Frontmatter-only reads (D2); no dataview, no IndexedDB.
 *
 * Rebuild is driven by main.ts (debounced metadataCache 'resolved' + fileClass
 * file changes). On each rebuild it fires the `fileclass:indexed` event.
 */
import { App, BookmarkItem, Events, TFile, getAllTags } from "obsidian";

import { dateFormatDefaults, FileclassSettings } from "../settings/settings";
import { withDefaultDateFormats } from "../fields/dateFormats";
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
	/** Reverse of `nameByPath`; `rebuild()` clears and refills both together. */
	private pathByName = new Map<string, string>();
	private ancestorsByName = new Map<string, string[]>();
	private fieldsByName = new Map<string, Field[]>();
	private tagBindings = new Map<string, string>();
	private pathBindings = new Map<string, string>();
	private bookmarkBindings = new Map<string, string>();
	/**
	 * note path → the bookmark groups holding it, nested ones as `parent/child`, each note
	 * counted for its group and that group's ancestors.
	 *
	 * Built once per rebuild rather than asked per note: the alternative walks the whole
	 * bookmark tree for every note in the vault. It also closes a hole — the resolver has
	 * accepted `bookmarkGroups` since day one and nothing ever filled it, so a class bound to
	 * a bookmark group claimed nothing at all (#121's take found it).
	 */
	private bookmarkGroupsByPath = new Map<string, string[]>();
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
		// Outside the class-folder guard: a vault can bookmark notes with no class at all, and
		// this map costs one walk of the bookmark tree.
		this.buildBookmarkMap();
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
		this.bookmarkGroupsByPath.clear();
		this.errors = [];
	}

	/** Is this note a fileClass declaration — a file of the class folder? */
	private isClassNote(file: TFile): boolean {
		const folder = this.host.settings.classFilesPath;
		return !!folder && file.path.startsWith(folder);
	}

	private indexFileClassNote(file: TFile): void {
		const name = fileClassNameFromPath(this.host.settings.classFilesPath, file.path);
		if (!name) return;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const parsed = parseFileClass(name, frontmatter);
		this.byName.set(name, parsed);
		this.nameByPath.set(file.path, name);
		this.pathByName.set(name, file.path);
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
			// Lower case, because a tag's case is not part of its identity: see the note on
			// `tagBindings` in resolver.ts. The class keeps its own capitalisation everywhere
			// else — this is the lookup key, not the name.
			if (mapWithTag && !name.includes(" ")) this.tagBindings.set(name.toLowerCase(), name);
			for (const tag of tagNames) {
				if (!tag.includes(" ")) this.tagBindings.set(tag.toLowerCase(), name);
			}
			for (const path of filesPaths) this.pathBindings.set(path, name);
			for (const group of bookmarksGroups) this.bookmarkBindings.set(group, name);
		}
	}

	// -- registry / resolution ------------------------------------------------

	/**
	 * A read-only registry view for the pure resolver.
	 *
	 * `forFile` exists for one rule: the global fileClass never applies to a **class note**.
	 * A global class is meant for a vault where every note is the same kind of thing, and
	 * `Classes/Book.md` is not one of those things — it is the declaration itself. Measured
	 * before the guard: setting a global class typed the whole class folder with it, so the
	 * definitions showed up in their own class's views.
	 */
	registry(forFile?: TFile): FileClassRegistry {
		const global =
			forFile && this.isClassNote(forFile)
				? undefined
				: this.host.settings.globalFileClass || undefined;
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
		return {
			innerNames,
			tags,
			folderPath: file.parent?.path ?? "",
			bookmarkGroups: this.bookmarkGroupsByPath.get(file.path) ?? [],
		};
	}

	/**
	 * Walks the Bookmarks core plugin once, recording which groups hold each file. A file in
	 * `Films/Tarkovsky` counts for `Films/Tarkovsky` **and** `Films`, the way a nested tag
	 * counts for its parent — a class bound to the outer group claims what the inner one holds.
	 */
	private buildBookmarkMap(): void {
		const instance = this.app.internalPlugins?.plugins?.bookmarks?.instance;
		const items = instance?.getBookmarks?.();
		if (!items?.length) return;

		const walk = (list: BookmarkItem[], groups: string[]): void => {
			for (const item of list) {
				if (item.type === "group") {
					const title = (item.title ?? "").trim();
					if (!title) continue;
					const path = [...groups, title];
					walk(item.items ?? [], path);
					continue;
				}
				const filePath = typeof item.path === "string" ? item.path : "";
				if (!filePath || !groups.length) continue;
				// Every ancestor, most specific last — the order does not matter, the set does.
				const names = groups.map((_, i) => groups.slice(0, i + 1).join("/"));
				const known = this.bookmarkGroupsByPath.get(filePath) ?? [];
				this.bookmarkGroupsByPath.set(filePath, [...new Set([...known, ...names])]);
			}
		};
		walk(items, []);
	}

	/** Full binding resolution for a note (fileClasses + merged fields). */
	resolve(file: TFile): Resolution {
		const resolution = resolveBinding(this.bindingFor(file), this.registry(file));
		// Fold the plugin-wide write format into date fields that declare none, so
		// every consumer (input, validation, display parsing) sees one effective
		// format. No-op — the same array — when the defaults are blank.
		const fields = withDefaultDateFormats(resolution.fields, dateFormatDefaults(this.host.settings));
		return fields === resolution.fields ? resolution : { ...resolution, fields };
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

	/** The Markdown note backing a fileClass, from the index (falling back to the conventional path) */
	getFileClassFile(name: string): TFile | null {
		const path = this.pathByName.get(name);
		if (path) {
			const file = this.app.vault.getFileByPath(path);
			if (file instanceof TFile) return file;
		}
		// Not indexed yet (class created before the debounced rebuild fired).
		const folder = this.host.settings.classFilesPath;
		if (!folder) return null;
		const file = this.app.vault.getFileByPath(`${folder}${name}.md`);
		return file instanceof TFile ? file : null;
	}
}
