/*
 * Shared DOM helpers for the field indicators (ARCHITECTURE.md §19.4). Kept in
 * one place so the nav-surface indicator (FieldIndicator) and the internal-link
 * indicator (LinkIndicator) build, resolve, and tear down icons identically.
 *
 * All icons share the visual class `fileclass-indicator` (for CSS); each surface
 * adds a scope class so it can clear only its own icons without disturbing the
 * other.
 */
import { TFile, setIcon } from "obsidian";

import type FileclassPlugin from "../../../main";
import { openFileClassSchema } from "../fileClassSchemaModal";
import { NoteFieldsModal } from "../noteFieldsModal";

export const INDICATOR_MARKER = "fileclass-indicator";
/** Scope for nav-surface icons (tab header, file explorer, bookmarks). */
export const NAV_SCOPE = "fileclass-indicator--nav";
/** Scope for internal-link icons (reading view, backlinks, Bases). */
export const LINK_SCOPE = "fileclass-indicator--link";

/** The file if Fileclass applies to `path` (Markdown note with resolved fields). */
export function fileWithFields(plugin: FileclassPlugin, path: string | null): TFile | null {
	if (!path) return null;
	const file = plugin.app.vault.getFileByPath(path);
	if (!(file instanceof TFile) || file.extension !== "md") return null;
	return plugin.index.getFields(file).length ? file : null;
}

/**
 * The file for a nav-surface indicator: a fileClass note (→ opens the schema
 * editor) or a note with resolved fields (→ opens the note-fields modal).
 */
export function navIndicatorFile(plugin: FileclassPlugin, path: string | null): TFile | null {
	if (path && plugin.index.fileClassNameOfNote(path)) {
		const file = plugin.app.vault.getFileByPath(path);
		if (file instanceof TFile) return file;
	}
	return fileWithFields(plugin, path);
}

/**
 * Builds the clickable indicator icon. On a fileClass note it opens the schema
 * editor (with the fileClass's own icon); otherwise the note-fields modal.
 */
export function makeIndicatorIcon(
	plugin: FileclassPlugin,
	file: TFile,
	scopeClass: string
): HTMLElement {
	const fileClassName = plugin.index.fileClassNameOfNote(file.path);
	const el = createSpan({ cls: `${INDICATOR_MARKER} ${scopeClass}` });
	// Stamp the source file so a reused target (a tab that changed file) can tell
	// a stale icon from an up-to-date one instead of keeping the old one.
	el.dataset.fcPath = file.path;
	el.setAttribute("aria-label", fileClassName ? "Edit fileClass" : "Fileclass fields");
	setIcon(el, fileClassName ? plugin.index.resolveIcon(fileClassName) : plugin.index.iconForFile(file));
	el.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (fileClassName) openFileClassSchema(plugin, fileClassName);
		else new NoteFieldsModal(plugin, file).open();
	});
	return el;
}

/** Removes only the icons of one scope, under `root` (document by default). */
export function removeIndicators(scopeClass: string, root: ParentNode = document): void {
	root.querySelectorAll(`.${scopeClass}`).forEach((el) => el.remove());
}
