/*
 * Sticky modal title (#47 UI). Creates a modal's <h3> heading pinned to the top
 * while the body scrolls, and marks the content scrollable so the pin has an
 * effect (idempotent with makeStickyFooter, which sets the same class). Use in
 * place of `contentEl.createEl("h3", { text })`.
 *
 * On desktop the title doubles as the modal's drag handle: what a centred modal hides is
 * often what you need to read while filling it in, and Obsidian offers no way to move
 * one. Every modal that has a title gets it, from this one place.
 *
 * **Not on mobile**, and not only because dragging a sheet with a thumb is a poor
 * gesture: the handle sets `touch-action: none`, which would take away scrolling the
 * modal by dragging its title — a real loss in exchange for nothing.
 */
import { Platform } from "obsidian";

import { makeDraggable } from "./modalDrag";

/** Adds a sticky <h3> title to `contentEl` and returns it. */
export function modalTitle(contentEl: HTMLElement, text: string): HTMLElement {
	contentEl.addClass("fileclass-scroll-body");
	const title = contentEl.createEl("h3", { text, cls: "fileclass-modal-title" });
	// `.modal` is the box Obsidian centres; without it there is nothing to move.
	const modalEl = contentEl.closest<HTMLElement>(".modal");
	if (modalEl && !Platform.isMobile) makeDraggable(modalEl, title);
	return title;
}
