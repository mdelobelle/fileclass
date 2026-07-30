/*
 * Checking a moment.js format string before it is used to write dates.
 *
 * moment never fails on a bad format: it prints whatever it doesn't recognise
 * verbatim, so `YYYY-KK-007` silently stores "2026-KK-007". That's the mistake
 * worth catching — a run of letters that isn't a token and isn't escaped.
 *
 * Pure (no moment, no Obsidian): the preview is rendered by the UI, this only
 * says what's wrong with the string.
 */

/**
 * Output tokens moment understands, longest first so a longest-match scan finds
 * `LLLL` before `L` and `dddd` before `dd`. Fraction tokens (`S`…`SSSSSSSSS`) and
 * eras are included; parse-only tokens are irrelevant here.
 */
const TOKENS: string[] = [
	"YYYYYY", "YYYY", "YY", "Y", "y",
	"NNNN", "NNN", "NN", "N",
	"gggg", "gg", "GGGG", "GG",
	"MMMM", "MMM", "MM", "Mo", "M",
	"Qo", "Q",
	"DDDD", "DDDo", "DDDD", "DDD", "DD", "Do", "D",
	"dddd", "ddd", "dd", "do", "d",
	"e", "E",
	"wo", "ww", "w", "Wo", "WW", "W",
	"LTS", "LT", "LLLL", "LLL", "LL", "L", "llll", "lll", "ll", "l",
	"A", "a",
	"HH", "H", "hh", "h", "kk", "k",
	"mm", "m",
	"ss", "s",
	"SSSSSSSSS", "SSSSSSSS", "SSSSSSS", "SSSSSS", "SSSSS", "SSSS", "SSS", "SS", "S",
	"zz", "z", "ZZ", "Z",
	"X", "x",
].sort((a, b) => b.length - a.length);

const LETTER = /[A-Za-z]/;

export interface FormatCheck {
	/** No unknown letters and no unterminated escape. */
	ok: boolean;
	/** Letter runs moment doesn't know — they would be written verbatim. */
	unknown: string[];
	/** One line to show the user, or "" when the format is fine. */
	message: string;
}

const VALID: FormatCheck = { ok: true, unknown: [], message: "" };

/**
 * Reports what moment would not understand in `format`. A blank format is fine
 * (it means "use the default"), literal text belongs in `[brackets]`, and
 * punctuation, digits and spaces are literal already.
 */
export function checkMomentFormat(format: string): FormatCheck {
	if (!format.trim()) return VALID;

	const unknown: string[] = [];
	let i = 0;
	while (i < format.length) {
		const ch = format[i];

		// Escaped literal: [anything] is passed through by moment.
		if (ch === "[") {
			const end = format.indexOf("]", i + 1);
			if (end === -1) {
				return {
					ok: false,
					unknown,
					message: "Unclosed [ — literal text must be wrapped like [this].",
				};
			}
			i = end + 1;
			continue;
		}

		if (!LETTER.test(ch)) {
			i++; // separators, digits, spaces: literal
			continue;
		}

		const token = TOKENS.find((t) => format.startsWith(t, i));
		if (token) {
			i += token.length;
			continue;
		}

		// An unknown letter: take the whole run, so "KK" is reported once.
		let j = i;
		while (j < format.length && format[j] === ch) j++;
		unknown.push(format.slice(i, j));
		i = j;
	}

	if (!unknown.length) return VALID;
	const list = unknown.map((u) => `"${u}"`).join(", ");
	return {
		ok: false,
		unknown,
		message:
			`${list} ${unknown.length > 1 ? "are not moment tokens" : "is not a moment token"} — ` +
			`${unknown.length > 1 ? "they" : "it"} would be written as-is. ` +
			"Wrap literal text in [brackets].",
	};
}
