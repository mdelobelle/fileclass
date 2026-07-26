/*
 * Sticky modal title (#47 UI). Creates a modal's <h3> heading pinned to the top
 * while the body scrolls, and marks the content scrollable so the pin has an
 * effect (idempotent with makeStickyFooter, which sets the same class). Use in
 * place of `contentEl.createEl("h3", { text })`.
 */

/** Adds a sticky <h3> title to `contentEl` and returns it. */
export function modalTitle(contentEl: HTMLElement, text: string): HTMLElement {
	contentEl.addClass("fileclass-scroll-body");
	return contentEl.createEl("h3", { text, cls: "fileclass-modal-title" });
}
