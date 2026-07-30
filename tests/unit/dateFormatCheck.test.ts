/*
 * Catching a bad moment format before it writes dates. moment prints what it
 * doesn't recognise verbatim, so the check is about unknown letter runs — the
 * silent failure — not about moment throwing.
 */
import { describe, expect, it } from "vitest";

import { checkMomentFormat } from "../../src/fields/dateFormatCheck";

const check = (fmt: string) => checkMomentFormat(fmt);

describe("checkMomentFormat", () => {
	it("accepts a blank format (it means: use the default)", () => {
		expect(check("").ok).toBe(true);
		expect(check("   ").ok).toBe(true);
	});

	it("accepts the formats people actually write", () => {
		for (const fmt of [
			"YYYY-MM-DD",
			"YYYY-MM-DD ddd",
			"DD/MM/YYYY",
			"LL",
			"LLLL",
			"LT",
			"LTS",
			"HH:mm",
			"HH[h]mm",
			"YYYY-MM-DD[T]HH:mm",
			"Do MMMM YYYY",
			"YYYY[-W]ww",
			"X",
			"YYYY-MM-DDTHH:mm:ss.SSSZ".replace("T", "[T]"),
		]) {
			expect(check(fmt), fmt).toMatchObject({ ok: true, unknown: [] });
		}
	});

	it("rejects an unknown letter run, and names it", () => {
		const r = check("YYYY-KK-007");
		expect(r.ok).toBe(false);
		expect(r.unknown).toEqual(["KK"]);
		expect(r.message).toContain('"KK"');
		expect(r.message).toContain("[brackets]");
	});

	it("reports every unknown run, once each", () => {
		expect(check("KK-YYYY-vv").unknown).toEqual(["KK", "vv"]);
	});

	it("accepts a repeated token, odd as it looks — moment does", () => {
		// QQQ is Q three times: strange output, but not an error to report.
		expect(check("QQQ").ok).toBe(true);
	});

	it("counts a bare T as unknown — it would be a literal", () => {
		// The native ISO datetime form escapes it: YYYY-MM-DD[T]HH:mm.
		expect(check("YYYY-MM-DDTHH:mm").unknown).toEqual(["T"]);
	});

	it("treats digits, punctuation and spaces as literal", () => {
		expect(check("YYYY/MM/DD, 007").ok).toBe(true);
	});

	it("accepts anything inside brackets", () => {
		expect(check("[Week] ww [of] YYYY").ok).toBe(true);
		expect(check("[KK]").ok).toBe(true);
	});

	it("flags an unclosed bracket", () => {
		const r = check("YYYY [week");
		expect(r.ok).toBe(false);
		expect(r.message).toContain("Unclosed [");
	});

	it("does not mistake a long token for an unknown run", () => {
		expect(check("SSSSSSSSS").ok).toBe(true); // nine-digit fraction
		expect(check("YYYYYY").ok).toBe(true);
	});
});
