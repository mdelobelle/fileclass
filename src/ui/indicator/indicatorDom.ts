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

/** Builds the clickable indicator icon that opens the note-fields modal. */
export function makeIndicatorIcon(
	plugin: FileclassPlugin,
	file: TFile,
	scopeClass: string
): HTMLElement {
	const el = createSpan({ cls: `${INDICATOR_MARKER} ${scopeClass}` });
	el.setAttribute("aria-label", "Fileclass fields");
	// The fileClass's own Lucide icon (with inheritance + configured fallback).
	setIcon(el, plugin.index.iconForFile(file));
	el.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		new NoteFieldsModal(plugin, file).open();
	});
	return el;
}

/** Removes only the icons of one scope, under `root` (document by default). */
export function removeIndicators(scopeClass: string, root: ParentNode = document): void {
	root.querySelectorAll(`.${scopeClass}`).forEach((el) => el.remove());
}
