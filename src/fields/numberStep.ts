/*
 * Stepping arithmetic for Number inputs (the − / + buttons and the arrow keys).
 * Pure and unit-tested: no Obsidian import, no DOM.
 *
 * Two rules worth stating, because they're the ones a user notices:
 *  - the first − or + on an empty field *shows* `min` (0 when there's no min)
 *    rather than stepping past it: one click, one legal value, whichever button
 *    you pressed. Stepping proper starts from the second click;
 *  - the result is clamped to `[min, max]` and rounded to the precision the step
 *    implies, so a 0.1 step can't produce 0.30000000000000004.
 */
import { NumberOptions } from "./options";

/** Decimals implied by a value, e.g. 0.25 → 2. */
function decimals(n: number): number {
	if (!Number.isFinite(n)) return 0;
	const s = String(n);
	if (s.includes("e-")) {
		// 1e-7 and friends: the exponent is the precision.
		const [mantissa, exp] = s.split("e-");
		return Number(exp) + decimals(Number(mantissa));
	}
	const dot = s.indexOf(".");
	return dot === -1 ? 0 : s.length - dot - 1;
}

/** The effective step: a positive, finite number, 1 by default. */
export function stepSize(options: NumberOptions): number {
	const { step } = options;
	return step != null && Number.isFinite(step) && step > 0 ? step : 1;
}

/** `current` as a number, or undefined when the field is empty or not numeric. */
function asNumber(current: unknown): number | undefined {
	if (typeof current === "number") return Number.isFinite(current) ? current : undefined;
	if (typeof current === "string" && current.trim() !== "") {
		const n = Number(current);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

/**
 * The value one step away from `current`.
 *
 * `direction` is +1 or -1. On an empty (or unparseable) field, either button
 * yields `min` itself — 0 when no minimum is set — so the first click always
 * produces a value the field accepts; from there the buttons step normally. The
 * result never leaves `[min, max]`.
 */
export function stepNumber(current: unknown, options: NumberOptions, direction: 1 | -1): number {
	const step = stepSize(options);
	const base = asNumber(current);
	if (base === undefined) return clamp(options.min ?? 0, options);
	const raw = base + direction * step;

	// Round at the precision the inputs imply, or 0.1 + 0.2 shows its seams.
	const precision = Math.max(decimals(step), decimals(base));
	const rounded = precision > 0 ? Number(raw.toFixed(Math.min(precision, 12))) : raw;
	return clamp(rounded, options);
}

/** Keeps a value inside the field's bounds. */
function clamp(value: number, { min, max }: NumberOptions): number {
	if (min != null && value < min) return min;
	if (max != null && value > max) return max;
	return value;
}
