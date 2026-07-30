/*
 * Builds the DisplayDeps consumed by objectDisplay.ts from the running plugin
 * (Obsidian side: pulls `moment`). Kept
 * apart from the pure display module so the latter needs no Obsidian import.
 */
import { moment as obsidianMoment } from "obsidian";

import { Field } from "../schema/field";
import { DisplayDeps } from "./objectDisplay";

interface MomentLike {
	isValid(): boolean;
	format(fmt: string): string;
}
const moment = obsidianMoment as unknown as (input?: string, format?: string) => MomentLike;

/** DisplayDeps for a note's field set. */
export function makeDisplayDeps(allFields: Field[]): DisplayDeps {
	return {
		allFields,
		formatMoment: (value, parseFormat, outFormat) => {
			const m = moment(value, parseFormat);
			return m.isValid() ? m.format(outFormat) : "";
		},
	};
}
