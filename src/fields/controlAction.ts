/*
 * What a control does to a field, decided by the field's type alone.
 *
 * Every surface that offers to change a value — the buttons in the native
 * Properties editor, a cell of the `fileclass-table` view, the note-fields
 * modal — must perform the SAME gesture for a given type. Before this, a `Cycle`
 * advanced by one value in the note-fields modal but opened a value picker
 * everywhere else, under a `rotate-cw` icon that promised the advance: the type's
 * whole point was invisible where people actually work.
 *
 * Pure and unit-tested on purpose: the mapping is the contract, the dispatch that
 * calls modals lives in fieldActions.
 */
import { FieldType } from "../schema/field";

/**
 * `cycle` — write the next allowed value; `toggle` — flip true/false;
 * `edit` — open the type's input (a picker, a prompt, a date modal…).
 */
export type ControlAction = "cycle" | "toggle" | "edit";

/** The one gesture a control performs on this type. */
export function controlActionFor(type: FieldType): ControlAction {
	switch (type) {
		case "Cycle":
			return "cycle";
		case "Boolean":
			return "toggle";
		default:
			return "edit";
	}
}

/**
 * Icon and wording for that gesture, so every surface labels it identically.
 * `alt` is the modifier hint: a type whose gesture writes a value straight away
 * still needs a way to reach its input, and that's Alt-click everywhere.
 */
export function controlLabel(action: ControlAction): { icon: string; verb: string; alt: boolean } {
	switch (action) {
		case "cycle":
			return { icon: "rotate-cw", verb: "Next value", alt: true };
		case "toggle":
			return { icon: "toggle-left", verb: "Toggle", alt: true };
		default:
			return { icon: "pencil", verb: "Edit", alt: false };
	}
}
