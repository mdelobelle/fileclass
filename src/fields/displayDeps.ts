/*
 * Builds the DisplayDeps consumed by objectDisplay.ts from the running plugin
 * (Obsidian side: pulls `moment` and the default date-display format). Kept
 * apart from the pure display module so the latter needs no Obsidian import.
 */
import { moment as obsidianMoment } from "obsidian";

import { Field } from "../schema/field";
import { FileclassSettings } from "../settings/settings";
import { AdapterHost } from "./candidates";
import { DisplayDeps } from "./objectDisplay";

interface MomentLike {
	isValid(): boolean;
	format(fmt: string): string;
}
const moment = obsidianMoment as unknown as (input?: string, format?: string) => MomentLike;

/** DisplayDeps for a note's field set (host is the plugin at runtime). */
export function makeDisplayDeps(host: AdapterHost, allFields: Field[]): DisplayDeps {
	const settings = (host as unknown as { settings?: FileclassSettings }).settings;
	return {
		allFields,
		defaultDateFormat: settings?.defaultDateDisplayFormat ?? "",
		formatMoment: (value, parseFormat, outFormat) => {
			const m = moment(value, parseFormat);
			return m.isValid() ? m.format(outFormat) : "";
		},
	};
}
