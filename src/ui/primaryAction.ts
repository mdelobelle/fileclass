/*
 * Alt+Enter runs the open modal's primary action, wherever the focus is.
 *
 * Enter already activates a focused button, but the caret is almost never there:
 * it sits in the field you just filled. Saving then means Tab-Tab-Tab or a mouse
 * trip. Alt+Enter is the escape hatch — one chord that means "do the thing this
 * modal is for", consistent with Alt elsewhere in the plugin ("the gesture the
 * plain key doesn't do").
 *
 * One window listener rather than a scope per modal: every Fileclass modal renders
 * its heading through modalTitle(), so `.fileclass-modal-title` identifies ours and
 * leaves Obsidian's own modals (and other plugins') alone. No private API, no
 * fifteen call sites to keep in step.
 */
import { Plugin } from "obsidian";

/** Marks the primary button; set by Obsidian's `.setCta()`. */
const CTA = "button.mod-cta";

/**
 * The primary button of the topmost Fileclass modal, or null when the topmost
 * modal isn't ours (or has no primary action).
 */
export function primaryActionOf(doc: Document): HTMLElement | null {
	const containers = doc.querySelectorAll<HTMLElement>(".modal-container");
	// Stacked modals: the last one in the DOM is the one on top.
	const top = containers[containers.length - 1];
	if (!top?.querySelector(".fileclass-modal-title")) return null;
	const buttons = top.querySelectorAll<HTMLButtonElement>(CTA);
	// A modal declares one; if it ever declares two, the last is the footer's.
	const cta = buttons[buttons.length - 1];
	return cta && !cta.disabled ? cta : null;
}

export function registerPrimaryActionShortcut(plugin: Plugin): void {
	plugin.registerDomEvent(
		window,
		"keydown",
		(e) => {
			if (e.key !== "Enter" || !e.altKey || e.ctrlKey || e.metaKey) return;
			const cta = primaryActionOf(document);
			if (!cta) return;
			e.preventDefault();
			e.stopPropagation();
			cta.click();
		},
		// Capture: ahead of the row-level Enter handlers, which ignore modifiers.
		true
	);
}
