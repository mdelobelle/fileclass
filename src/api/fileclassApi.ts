/*
 * Public plugin API (ARCHITECTURE.md §12). A stable, JSON-serializable surface
 * over the schema/validation/index engine, exposed on the plugin instance
 * (`app.plugins.plugins.fileclass.api`) so it is reachable from the Obsidian CLI
 * (`obsidian eval "…"`) and a future `fileclass` CLI/TUI.
 *
 * Design (see the API-1 spec): JSON in/out (paths, field names, plain values —
 * never TFile/Field-with-methods), non-interactive (setValue validates then
 * writes, no modal), thin wiring over existing modules, structured results
 * (mutations return { ok, message } and never throw for a domain error),
 * versioned. Bases-dependent bits degrade gracefully when Bases is unavailable.
 */
import { TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { Filter, matchesFilter } from "./filter";
import { insertMissingFields } from "../commands/insertMissingFields";
import { getBaseRows } from "../engine/basesAdapter";
import { isMediaType, resolveCandidates } from "../fields/candidates";
import { formatLink } from "../fields/links";
import { baseBindingOptions } from "../fields/options";
import { openFileClassSchema } from "../ui/fileClassSchemaModal";
import { makeDisplayDeps } from "../fields/displayDeps";
import { clearField } from "../fields/fieldActions";
import { describeField } from "../fields/objectDisplay";
import { hasAllowedValues, validateField } from "../fields/validate";
import { resolveFieldValues } from "../fields/valuesIo";
import { readFieldValue } from "../io/read";
import { writeFieldValue } from "../io/write";
import { Field, isRootField } from "../schema/field";
import { fileClassBaseFile } from "../views/baseSync";

export const API_VERSION = "1.0";

const LINK_TYPES = new Set<string>(["File", "MultiFile", "Media", "MultiMedia"]);

export interface FileClassSummary {
	name: string;
	extends: string | null;
	fieldCount: number;
	icon: string;
	hasBase: boolean;
}
export interface FieldDef {
	name: string;
	id: string;
	type: string;
	options: unknown;
	path: string;
}
export interface SchemaDef {
	name: string;
	ancestors: string[];
	options: Record<string, unknown>;
	fields: FieldDef[];
}
export interface FieldInfo {
	name: string;
	type: string;
	owner: string;
	path: string;
	isRoot: boolean;
}
export interface ExplainField {
	name: string;
	type: string;
	owner: string;
	present: boolean;
	value: unknown;
	display: string;
}
export interface NoteExplain {
	path: string;
	fileClasses: string[];
	ancestry: string[][];
	fields: ExplainField[];
}
export interface Violation {
	path: string;
	field: string;
	type: string;
	message: string;
	severity: "error" | "warning";
}
export interface WriteResult {
	ok: boolean;
	path: string;
	field?: string;
	message?: string;
}
/** Empty scope = the whole vault. */
export interface ValidateScope {
	fileClass?: string;
	path?: string;
	folder?: string;
}
export interface NoteRow {
	path: string;
	values: Record<string, unknown>;
}
export interface BaseTable {
	columns: string[];
	rows: NoteRow[];
}
export interface BulkResult {
	ok: boolean;
	changed: number;
	skipped: number;
	errors: WriteResult[];
}
export interface ListOptions {
	columns?: string[];
	where?: Filter;
	limit?: number;
}

export interface FileclassApi {
	/** Semver of this surface; bumped on breaking changes. */
	readonly version: string;

	// Inspect
	vaultInfo(): Promise<{ name: string; path: string }>;
	listFileClasses(): Promise<FileClassSummary[]>;
	getSchema(fileClass: string): Promise<SchemaDef | null>;
	explain(path: string): Promise<NoteExplain | null>;
	getFields(path: string): Promise<FieldInfo[]>;
	getValue(path: string, field: string): Promise<unknown>;
	allowedValues(path: string, field: string): Promise<string[]>;
	/** Link candidates for a File/MultiFile/Media/MultiMedia field. */
	fileCandidates(path: string, field: string): Promise<{ display: string; link: string }[]>;
	listNotes(fileClass: string, opts?: ListOptions): Promise<NoteRow[]>;

	/** The fileClass's base view as rows/columns (null if no base / Bases off). */
	baseTable(fileClass: string): Promise<BaseTable | null>;
	/** Opens the fileClass's schema editor in the Obsidian window. */
	openSchema(fileClass: string): Promise<WriteResult>;

	// Validate
	validate(scope?: ValidateScope): Promise<Violation[]>;

	// Mutate (non-interactive, validated, single write)
	setValue(path: string, field: string, value: unknown): Promise<WriteResult>;
	clearValue(path: string, field: string): Promise<WriteResult>;
	insertMissing(path: string): Promise<WriteResult>;
	setValueWhere(
		fileClass: string,
		field: string,
		value: unknown,
		where?: Filter
	): Promise<BulkResult>;
}

export function createFileclassApi(plugin: FileclassPlugin): FileclassApi {
	const app = plugin.app;
	const index = plugin.index;

	const fileOrNull = (path: string): TFile | null => {
		const f = app.vault.getFileByPath(path);
		return f instanceof TFile ? f : null;
	};
	const requireFile = (path: string): TFile => {
		const f = fileOrNull(path);
		if (!f) throw new Error(`Fileclass API: no file at "${path}".`);
		return f;
	};
	const rootField = (file: TFile, name: string): Field | undefined =>
		index.getFields(file).find((x) => x.name === name && isRootField(x));

	const readByName = (file: TFile, name: string): unknown => {
		const f = rootField(file, name);
		return f ? readFieldValue(app, file, f) : undefined;
	};

	/** Notes bound to `fileClass`, optionally narrowed by a filter. */
	const selectNotes = (fileClass: string, where?: Filter): TFile[] => {
		const bound = app.vault
			.getMarkdownFiles()
			.filter((f) => index.getFileClasses(f).includes(fileClass));
		return where ? bound.filter((f) => matchesFilter(readByName(f, where.field), where)) : bound;
	};

	const sameStored = (a: unknown, b: unknown): boolean =>
		Array.isArray(a) || Array.isArray(b)
			? JSON.stringify(a) === JSON.stringify(b)
			: String(a ?? "") === String(b ?? "");

	/** Allowed values for a choice field (Select/Cycle/Multi, Bases-aware); else []. */
	const allowedFor = (file: TFile, field: Field): Promise<string[]> =>
		hasAllowedValues(field.type) ? resolveFieldValues(plugin, field, file) : Promise.resolve([]);

	const toFieldDef = (f: Field): FieldDef => ({
		name: f.name,
		id: f.id,
		type: f.type,
		options: f.options,
		path: f.path,
	});

	const filesForScope = (scope: ValidateScope): TFile[] => {
		if (scope.path) {
			const f = fileOrNull(scope.path);
			return f ? [f] : [];
		}
		let files = app.vault.getMarkdownFiles();
		if (scope.folder) {
			const prefix = scope.folder.replace(/\/+$/, "") + "/";
			files = files.filter((f) => f.path.startsWith(prefix));
		}
		return files;
	};

	return {
		version: API_VERSION,

		async vaultInfo() {
			const adapter = app.vault.adapter as unknown as {
				basePath?: string;
				getBasePath?: () => string;
			};
			return { name: app.vault.getName(), path: adapter.getBasePath?.() ?? adapter.basePath ?? "" };
		},

		async listFileClasses() {
			return index.fileClassNames.map((name) => {
				const fc = index.getFileClass(name);
				return {
					name,
					extends: fc?.options.extends ?? null,
					fieldCount: index.getResolvedFields(name).filter(isRootField).length,
					icon: index.resolveIcon(name),
					hasBase: !!fileClassBaseFile(plugin, name),
				};
			});
		},

		async getSchema(fileClass) {
			const fc = index.getFileClass(fileClass);
			if (!fc) return null;
			return {
				name: fileClass,
				ancestors: index.getAncestors(fileClass),
				options: { ...fc.options },
				fields: index.getResolvedFields(fileClass).map(toFieldDef),
			};
		},

		async explain(path) {
			const file = fileOrNull(path);
			if (!file) return null;
			const fileClasses = index.getFileClasses(file);
			if (!fileClasses.length) return null;
			const roots = index.getFields(file).filter(isRootField);
			const deps = makeDisplayDeps(plugin, index.getFields(file));
			return {
				path: file.path,
				fileClasses,
				ancestry: fileClasses.map((n) => [n, ...index.getAncestors(n)]),
				fields: roots.map((f) => {
					const value = readFieldValue(app, file, f);
					return {
						name: f.name,
						type: f.type,
						owner: f.fileClassName,
						present: value !== undefined,
						value: value ?? null,
						display: describeField(f, value, deps),
					};
				}),
			};
		},

		async getFields(path) {
			const file = requireFile(path);
			return index.getFields(file).map((f) => ({
				name: f.name,
				type: f.type,
				owner: f.fileClassName,
				path: f.path,
				isRoot: isRootField(f),
			}));
		},

		async getValue(path, field) {
			const file = requireFile(path);
			const f = rootField(file, field);
			if (!f) throw new Error(`Fileclass API: no field "${field}" on "${path}".`);
			return readFieldValue(app, file, f) ?? null;
		},

		async allowedValues(path, field) {
			const file = requireFile(path);
			const f = rootField(file, field);
			return f ? allowedFor(file, f) : [];
		},

		async fileCandidates(path, field) {
			const file = requireFile(path);
			const f = rootField(file, field);
			if (!f || !LINK_TYPES.has(f.type)) return [];
			const embed = isMediaType(f.type) && baseBindingOptions(f).embed;
			const candidates = await resolveCandidates(plugin, f, file);
			return candidates.map((c) => ({
				display: c.display,
				link: formatLink(
					app,
					c.file,
					file.path,
					c.display !== c.file.basename ? c.display : undefined,
					embed
				),
			}));
		},

		async listNotes(fileClass, opts = {}) {
			const columns =
				opts.columns ??
				index
					.getResolvedFields(fileClass)
					.filter(isRootField)
					.map((f) => f.name);
			let notes = selectNotes(fileClass, opts.where);
			if (opts.limit != null) notes = notes.slice(0, opts.limit);
			return notes.map((file) => ({
				path: file.path,
				values: Object.fromEntries(columns.map((c) => [c, readByName(file, c) ?? null])),
			}));
		},

		async baseTable(fileClass) {
			const fc = index.getFileClass(fileClass);
			const baseFile = fc?.options.baseFile?.trim();
			if (!baseFile || !plugin.basesAvailable) return null;
			const view = fc?.options.baseView?.trim() || fileClass;
			const result = await getBaseRows(app, baseFile, view, null);
			return {
				columns: result.columns,
				rows: result.rows.map((r) => ({ path: r.file.path, values: r.values })),
			};
		},

		async openSchema(fileClass) {
			if (!index.getFileClass(fileClass)) {
				return { ok: false, path: fileClass, message: `No fileClass "${fileClass}".` };
			}
			openFileClassSchema(plugin, fileClass);
			return { ok: true, path: fileClass };
		},

		async validate(scope = {}) {
			const violations: Violation[] = [];
			for (const file of filesForScope(scope)) {
				const names = index.getFileClasses(file);
				if (scope.fileClass && !names.includes(scope.fileClass)) continue;
				for (const f of index.getFields(file).filter(isRootField)) {
					const value = readFieldValue(app, file, f);
					const result = validateField(f, value, await allowedFor(file, f));
					if (!result.ok) {
						violations.push({
							path: file.path,
							field: f.name,
							type: f.type,
							message: result.message ?? "Invalid value",
							severity: "error",
						});
					}
				}
			}
			return violations;
		},

		async setValue(path, field, value) {
			const file = fileOrNull(path);
			if (!file) return { ok: false, path, field, message: `No file at "${path}".` };
			const f = rootField(file, field);
			if (!f) return { ok: false, path, field, message: `No field "${field}" on this note.` };
			const result = validateField(f, value, await allowedFor(file, f));
			if (!result.ok) return { ok: false, path, field, message: result.message };
			try {
				await writeFieldValue(app, file, f, value);
				return { ok: true, path, field };
			} catch (e) {
				return { ok: false, path, field, message: (e as Error).message };
			}
		},

		async clearValue(path, field) {
			const file = fileOrNull(path);
			if (!file) return { ok: false, path, field, message: `No file at "${path}".` };
			const f = rootField(file, field);
			if (!f) return { ok: false, path, field, message: `No field "${field}" on this note.` };
			try {
				await clearField(app, file, f);
				return { ok: true, path, field };
			} catch (e) {
				return { ok: false, path, field, message: (e as Error).message };
			}
		},

		async insertMissing(path) {
			const file = fileOrNull(path);
			if (!file) return { ok: false, path, message: `No file at "${path}".` };
			try {
				await insertMissingFields(app, file, index.getFields(file));
				return { ok: true, path };
			} catch (e) {
				return { ok: false, path, message: (e as Error).message };
			}
		},

		async setValueWhere(fileClass, field, value, where) {
			let changed = 0;
			let skipped = 0;
			const errors: WriteResult[] = [];
			for (const file of selectNotes(fileClass, where)) {
				const f = rootField(file, field);
				if (!f) {
					errors.push({ ok: false, path: file.path, field, message: `No field "${field}".` });
					continue;
				}
				const result = validateField(f, value, await allowedFor(file, f));
				if (!result.ok) {
					errors.push({ ok: false, path: file.path, field, message: result.message });
					continue;
				}
				if (sameStored(readFieldValue(app, file, f), value)) {
					skipped++; // already at the target value — no write
					continue;
				}
				try {
					await writeFieldValue(app, file, f, value);
					changed++;
				} catch (e) {
					errors.push({ ok: false, path: file.path, field, message: (e as Error).message });
				}
			}
			return { ok: errors.length === 0, changed, skipped, errors };
		},
	};
}
