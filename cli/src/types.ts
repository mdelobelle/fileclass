/* Mirror of the plugin API DTOs (the wire is JSON, so these are for the CLI's
 * own type-safety only). Keep in sync with src/api/fileclassApi.ts. */

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
export interface NoteRow {
	path: string;
	values: Record<string, unknown>;
}
export interface BaseTable {
	columns: string[];
	rows: NoteRow[];
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
export interface BulkResult {
	ok: boolean;
	changed: number;
	skipped: number;
	errors: WriteResult[];
}
