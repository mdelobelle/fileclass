/*
 * Opening a field's settings from anywhere.
 *
 * The definition editor used to be reachable only from the schema editor: to change
 * one option of a field you were looking at in a note, you left the note, opened its
 * fileClass, found the field, clicked Edit. This is the same editor, addressable by
 * field — the note-fields modal Alt-clicks a row's type icon to get here.
 *
 * It also owns what saving a definition implies beyond the write: a dependent field
 * (#19) needs its formula and view in the bound base, and that must happen whichever
 * door the author came through.
 */
import { Notice, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { dateFormatDefaults } from "../settings/settings";
import { mutateFields } from "../schema/fileClassIo";
import { updateFieldDef } from "../schema/fileClassWrite";
import { Field } from "../schema/field";
import { applyConditional } from "../views/conditionalSync";
import { FileClassSchemaModal } from "./fileClassSchemaModal";
import { childPathOf } from "../schema/field";
import { FieldDefModal, FieldDefResult } from "./fieldDefModal";
import { migrateRenamedField } from "../commands/renameFieldMigration";

/**
 * Generates the formula and view a dependent field needs (#19). No-op for a field
 * without a dependency, so every save path can call it unconditionally.
 */
export function writeFieldDependency(
	plugin: FileclassPlugin,
	fileClassName: string,
	result: FieldDefResult
): void {
	const o = result.options;
	if (!o || Array.isArray(o)) return;
	const baseFile = typeof o.baseFile === "string" ? o.baseFile : "";
	const source = typeof o.dependsOn === "string" ? o.dependsOn : "";
	const match = typeof o.matchProperty === "string" ? o.matchProperty : "";
	const sourceView = typeof o.sourceView === "string" ? o.sourceView : "";
	if (!baseFile || !source || !match || !sourceView) return;
	const sourceType =
		plugin.index.getResolvedFields(fileClassName).find((f) => f.name === source)?.type ?? "Input";
	void applyConditional(plugin, { baseFile, sourceView, source, sourceType, match });
}

/**
 * Opens the definition editor for `field`, writing back to the fileClass note that
 * declares it — which may be an ancestor, for an inherited field.
 */
export function openFieldSettings(plugin: FileclassPlugin, field: Field): void {
	const owner = field.fileClassName;
	const file = plugin.index.getFileClassFile(owner);
	if (!(file instanceof TFile)) {
		new Notice(`Fileclass: could not find the note for "${owner}".`);
		return;
	}
	new FieldDefModal(plugin.app, {
		title: `Edit ${field.name}`,
		dateDefaults: dateFormatDefaults(plugin.settings),
		classFields: plugin.index.getResolvedFields(owner),
		initial: { name: field.name, type: field.type, options: field.options },
		onEditChildren: () =>
			new FileClassSchemaModal(plugin, owner, file, childPathOf(field)).open(),
		onSubmit: (r) => {
			void mutateFields(plugin.app, file, (fields) =>
				updateFieldDef(fields, field.id, { name: r.name, type: r.type, options: r.options })
			).then(async () => {
				writeFieldDependency(plugin, owner, r);
				// A rename is a data migration (#108): the class note is written, the notes that
				// carry the old key are listed and rewritten only if the author says so.
				await migrateRenamedField(plugin, { ...field, name: r.name }, field.name);
			});
		},
	}).open();
}
