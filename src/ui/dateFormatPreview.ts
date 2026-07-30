/*
 * Live feedback under every input where a user types a date format: what today's
 * date looks like through it, and what moment won't understand.
 *
 * A moment format is unreadable until you see its output — `Do MMMM YYYY` and
 * `DD/MM/YY` are the same shape of string on screen and nothing alike in a file.
 * And moment never rejects a format: it prints unknown letters verbatim, so
 * `YYYY-KK-007` writes "2026-KK-007" without a word. Both problems are answered
 * by showing the result, in the settings and in a field's own options alike.
 */
import { Setting, moment as obsidianMoment } from "obsidian";

import { checkMomentFormat } from "../fields/dateFormatCheck";

interface MomentLike {
	format(fmt: string): string;
}
const moment = obsidianMoment as unknown as (input?: string) => MomentLike;

/** `now` through `format`, or "" when the format is blank. */
export function formatNow(format: string): string {
	if (!format.trim()) return "";
	try {
		return moment().format(format);
	} catch {
		return ""; // moment is lenient, but never let a preview break a settings pane
	}
}

/**
 * Adds a preview line under a setting and returns the updater to call on every
 * keystroke. `fallback` is the format used when the input is blank (the plugin
 * default, or the native ISO form), so the line always shows what will be
 * written rather than nothing.
 */
export function attachFormatPreview(
	setting: Setting,
	fallback: () => string
): (format: string) => void {
	const preview = setting.descEl.createDiv({ cls: "fileclass-format-preview" });
	return (format: string) => {
		preview.empty();
		const effective = format.trim() || fallback().trim();
		const check = checkMomentFormat(format);
		const sample = formatNow(effective);

		if (sample) {
			preview.createSpan({ cls: "fileclass-format-sample", text: `now → ${sample}` });
		}
		if (!check.ok) {
			preview.createDiv({ cls: "fileclass-format-problem", text: check.message });
		}
	};
}

/**
 * Same idea for the link path of a date field: shows the wikilink that would be
 * written today, tokens expanded, and flags what moment can't read inside them.
 */
export function attachLinkPreview(
	setting: Setting,
	build: (isoDate: string) => string
): () => void {
	const preview = setting.descEl.createDiv({ cls: "fileclass-format-preview" });
	return () => {
		preview.empty();
		const today = moment().format("YYYY-MM-DD");
		const sample = build(today);
		if (sample) {
			preview.createSpan({ cls: "fileclass-format-sample", text: `now → ${sample}` });
		}
	};
}
