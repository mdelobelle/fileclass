/*
 * "Did I need to press Save?" — answered in two places at once.
 *
 * Every editing modal here holds a draft and commits it with Save, and nothing said
 * so: Escape or the close button threw the work away in silence, which is how an
 * operator loses a field definition they had just filled in.
 *
 * So: a footer line appears the moment a draft differs from what it started as, and
 * closing a dirty modal asks rather than discards. The question is asked once, with
 * the three answers that exist — save it, throw it away, or go back to editing.
 */
import { App, Modal, Setting } from "obsidian";

export { snapshot } from "./draftSnapshot";

/** What the operator chose when asked about unsaved changes. */
export type UnsavedChoice = "save" | "discard" | "keep";

export interface UnsavedGuardOptions {
	/** True when the draft differs from the value the modal opened on. */
	isDirty: () => boolean;
	/**
	 * Commits the draft, exactly as the Save button does. Return false to keep the
	 * modal open (a validation error, say) — the close is then abandoned too.
	 */
	save: () => boolean | void;
	/** What the draft is called in the question: "field", "group", "value"… */
	subject?: string;
}

export interface UnsavedGuard {
	/** Re-reads dirtiness and updates the footer line. Call after a change. */
	refresh: () => void;
	/**
	 * Puts the "unsaved changes" line at the left of a footer row — call it with the
	 * `Setting`'s element so it shares the line with the buttons, which is the part of
	 * a long list that stays on screen.
	 */
	mountHint: (parent: HTMLElement) => void;
}

const HINT_CLASS = "fileclass-unsaved-hint";

/**
 * Wraps `modal.close` so a dirty draft is never dropped without a word, and offers a
 * hint element to mount wherever the modal's Save button lives.
 *
 * Wrapping `close` rather than overriding `onClose` is deliberate: Obsidian calls
 * `close()` for Escape, for the X, and for a click outside, and `onClose` runs when
 * the closing is already decided — too late to ask anything.
 */
export function attachUnsavedGuard(
	app: App,
	modal: Modal,
	opts: UnsavedGuardOptions
): UnsavedGuard {
	let hintEl: HTMLElement | null = null;
	let asking = false;
	const nativeClose = modal.close.bind(modal);

	const refresh = (): void => {
		if (!hintEl) return;
		hintEl.toggleClass("is-visible", opts.isDirty());
	};

	modal.close = (): void => {
		if (asking || !opts.isDirty()) {
			nativeClose();
			return;
		}
		asking = true;
		void askUnsaved(app, opts.subject ?? "changes").then((choice) => {
			asking = false;
			if (choice === "keep") return;
			if (choice === "discard") {
				nativeClose();
				return;
			}
			if (opts.save() === false) return; // save refused; stay open
			nativeClose();
		});
	};

	return {
		refresh,
		mountHint: (parent: HTMLElement): void => {
			hintEl = parent.createDiv({ cls: HINT_CLASS, text: "Unsaved changes" });
			parent.prepend(hintEl); // first item of the row: `margin-right: auto` pins it left
			refresh();
		},
	};
}

/** The question, asked once, with the three answers that exist. */
function askUnsaved(app: App, subject: string): Promise<UnsavedChoice> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText("Unsaved changes");
		modal.contentEl.createEl("p", {
			text: `Your ${subject} has changes that aren't saved yet.`,
		});
		let choice: UnsavedChoice = "keep";
		new Setting(modal.contentEl)
			.addButton((b) =>
				b.setButtonText("Keep editing").onClick(() => {
					choice = "keep";
					modal.close();
				})
			)
			.addButton((b) =>
				b.setButtonText("Discard").setWarning().onClick(() => {
					choice = "discard";
					modal.close();
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						choice = "save";
						modal.close();
					})
			);
		modal.onClose = (): void => {
			modal.contentEl.empty();
			resolve(choice);
		};
		modal.open();
	});
}
