/*
 * Sticky modal footer (#49). Marks a modal's content as scrollable and returns
 * a footer container pinned to the bottom, so the primary action (Save / Add …)
 * stays visible even when the fields overflow the modal. Call after building the
 * content; put the action buttons in the returned element.
 */

/** Makes `contentEl` scroll and returns a bottom-pinned footer (appended last). */
export function makeStickyFooter(contentEl: HTMLElement): HTMLElement {
	contentEl.addClass("fileclass-scroll-body");
	return contentEl.createDiv({ cls: "fileclass-sticky-footer" });
}
