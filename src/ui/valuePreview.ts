/*
 * Shared field-value preview (#44). A type-appropriate visual cue rendered
 * beside a value wherever Fileclass displays one: a color swatch (Color), the
 * rendered glyph (Icon), or the image itself (Media). Display-only — no storage
 * change. Returns a detached element the caller positions (prepend/insertBefore),
 * or null when the type has no preview or the value is empty/invalid.
 */
import { App } from "obsidian";

import { Field } from "../schema/field";
import { isValidCssColor } from "../fields/color";
import { humanDurationsFor } from "../fields/duration";
import { paintIcon } from "./iconSuggest";
import { thumbForValue } from "./mediaThumb";

/** What a Media preview needs to resolve its link; omit it and Media shows nothing. */
export interface PreviewContext {
	app: App;
	/** The note holding the value — link resolution is relative to it. */
	sourcePath: string;
	/**
	 * The stored value, when the caller has it. A `MultiMedia` display string is
	 * comma-joined, and splitting it back apart would break on a file name that
	 * contains ", " — the list itself is unambiguous.
	 */
	raw?: unknown;
}

/** How many thumbnails a list value shows before it is just noise. */
const MAX_THUMBS = 3;

/** A preview element for `field`'s `value`, or null when there's nothing to show. */
export function makeValuePreview(
	field: Field,
	value: string,
	ctx?: PreviewContext
): HTMLElement | null {
	if (!value) return null;
	if (field.type === "Media" && ctx) {
		return thumbForValue(ctx.app, value, ctx.sourcePath);
	}
	if (field.type === "MultiMedia" && ctx && Array.isArray(ctx.raw)) {
		const thumbs = ctx.raw
			.slice(0, MAX_THUMBS)
			.map((item) => thumbForValue(ctx.app, item, ctx.sourcePath))
			.filter((el): el is HTMLElement => !!el);
		if (!thumbs.length) return null;
		const strip = createSpan({ cls: "fileclass-thumb-strip" });
		strip.append(...thumbs);
		return strip;
	}
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
	// A duration is stored as an RFC 5545 string, which is right on disk and unreadable
	// on screen. The reading is shown *beside* the stored value, never over it: Obsidian's
	// own value is an editable text property, and overwriting its text would risk writing
	// "45m 44s" back into the frontmatter.
	if (field.type === "Duration" || field.type === "CycleDuration") {
		const text = humanDurationsFor(field.type === "CycleDuration" ? ctx?.raw : value, value);
		if (!text) return null;
		return createSpan({ cls: "fileclass-duration-human", text });
	}
	return null;
}
