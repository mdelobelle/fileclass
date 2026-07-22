/*
 * Pure CSS-color validation for the Color field (#33, ARCHITECTURE §7.1). No
 * Obsidian: the palette/swatch UI lives in the picker; storage is a raw CSS
 * color value (hex / rgb()/hsl() / named), matching what the core Bases Map view
 * `color` marker property accepts. The picker produces hex; named/functional
 * values are accepted too (mostly for hand-edited frontmatter).
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const FUNC_RE = /^(rgba?|hsla?)\(\s*[\d.,%\s/]+\)$/iu;

// The standard CSS named colors (+ transparent / currentColor), lowercased.
const NAMED_COLORS = new Set(
	(
		"aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
		"blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
		"crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
		"darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
		"darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
		"dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
		"gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
		"lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
		"lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
		"lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
		"magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
		"mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
		"mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
		"palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
		"powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
		"seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
		"steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
		"yellowgreen transparent currentcolor"
	).split(" ")
);

/** True when `str` is a valid CSS color (hex, rgb()/hsl(), or a named color). */
export function isValidCssColor(str: string): boolean {
	if (typeof str !== "string") return false;
	const s = str.trim();
	if (!s) return false;
	return HEX_RE.test(s) || FUNC_RE.test(s) || NAMED_COLORS.has(s.toLowerCase());
}
