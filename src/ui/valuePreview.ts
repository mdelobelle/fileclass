/*
 * Shared field-value preview (#44). A type-appropriate visual cue rendered
 * beside a value wherever Fileclass displays one: a color swatch (Color) or the
 * rendered glyph (Icon). Display-only — no storage change. Returns a detached
 * element the caller positions (prepend/insertBefore), or null when the type
 * has no preview or the value is empty/invalid.
 */
import { Field } from "../schema/field";
import { isValidCssColor } from "../fields/color";
import { paintIcon } from "./iconSuggest";

/** A preview element for `field`'s `value`, or null when there's nothing to show. */
export function makeValuePreview(field: Field, value: string): HTMLElement | null {
	if (!value) return null;
	if (field.type === "Color") {
		if (!isValidCssColor(value)) return null;
		const dot = createSpan({ cls: "fileclass-color-dot" });
		dot.setCssStyles({ backgroundColor: value });
		return dot;
	}
	if (field.type === "Icon") {
		const glyph = createSpan({ cls: "fileclass-value-icon" });
		paintIcon(glyph, value);
		return glyph;
	}
	return null;
}
