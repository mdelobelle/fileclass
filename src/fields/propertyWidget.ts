/*
 * The Obsidian property widget a field type deserves (#207).
 *
 * Obsidian keeps its own idea of what a property is — checkbox, number, date, datetime, text,
 * multitext — in `.obsidian/types.json`, and **infers** it from the first values it sees when
 * nothing is assigned. A Boolean field inserted as `signed: ""` therefore taught Obsidian that
 * `signed` is text, and the Properties panel drew a text box for the rest of that property's life:
 * reported on 31 August 2026, across several vaults, on every boolean created that day.
 *
 * Two facts, both measured on a live vault, decide the shape of the fix:
 *   - an empty value is not enough. `signed:` with nothing after it still infers `text`, because
 *     inference runs on the property, not on our intentions;
 *   - an assigned type is enough, and it survives closing the note — but only if the value is
 *     genuinely empty. With the type assigned to `checkbox` and the value left as `""`, the panel
 *     goes back to drawing a text box, which is exactly what the reporter saw when they set the
 *     type by hand.
 *
 * So Fileclass says what the property is, and writes nothing where it has nothing.
 *
 * Only the types where the mapping is beyond argument. A `File` holds a link and Obsidian's `text`
 * is what it would infer anyway; an `Object` holds a map, which no widget describes. Guessing there
 * would overwrite a reader's own choice with our approximation.
 */
import { FieldType } from "../schema/field";

/** The widget ids Obsidian registers (`app.metadataTypeManager.registeredTypeWidgets`). */
export type PropertyWidget = "checkbox" | "number" | "date" | "datetime" | "multitext";

const WIDGETS: Partial<Record<FieldType, PropertyWidget>> = {
	Boolean: "checkbox",
	Number: "number",
	Date: "date",
	DateTime: "datetime",
	Multi: "multitext",
	MultiInput: "multitext",
	MultiFile: "multitext",
	MultiMedia: "multitext",
	CycleDuration: "multitext",
};

/** The widget Obsidian should use for a field of this type, or null when we should not say. */
export function widgetForFieldType(type: FieldType): PropertyWidget | null {
	return WIDGETS[type] ?? null;
}
