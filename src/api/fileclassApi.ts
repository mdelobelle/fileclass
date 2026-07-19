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
import { insertMissingFields } from "../commands/insertMissingFields";
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

export interface FileclassApi {
	/** Semver of this surface; bumped on breaking changes. */
	readonly version: string;

	// Inspect
	listFileClasses(): Promise<FileClassSummary[]>;
	getSchema(fileClass: string): Promise<SchemaDef | null>;
	explain(path: string): Promise<NoteExplain | null>;
	getFields(path: string): Promise<FieldInfo[]>;
	getValue(path: string, field: string): Promise<unknown>;
	allowedValues(path: string, field: string): Promise<string[]>;

	// Validate
	validate(scope?: ValidateScope): Promise<Violation[]>;

	// Mutate (non-interactive, validated, single write)
	setValue(path: string, field: string, value: unknown): Promise<WriteResult>;
	clearValue(path: string, field: string): Promise<WriteResult>;
	insertMissing(path: string): Promise<WriteResult>;
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
				options: { ...fc.options } as Record<string, unknown>,
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
	};
}
