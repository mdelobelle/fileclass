/*
 * `.fileclass` files are not markdown, so Obsidian does not index their
 * frontmatter. These pure helpers split a definition's raw text into its YAML
 * block and trailing body (kept verbatim for the human description), and
 * reassemble it after an edit. The YAML text itself is parsed/serialized by the
 * caller (obsidian `parseYaml`/`stringifyYaml`), keeping this module pure.
 */

/** Splits raw `.fileclass` content into its frontmatter YAML and trailing body.
 *  Tolerates CRLF as well as LF line endings. */
export function splitFileClassSource(raw: string): { frontmatter: string; body: string } {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (m) return { frontmatter: m[1], body: m[2] };
	// No delimited block — treat the whole file as YAML (a pure-YAML definition).
	return { frontmatter: raw, body: "" };
}

/** Reassembles a `.fileclass` file from serialized YAML plus its (verbatim) body. */
export function assembleFileClassSource(frontmatterYaml: string, body: string): string {
	const fm = frontmatterYaml.endsWith("\n") ? frontmatterYaml : `${frontmatterYaml}\n`;
	return body ? `---\n${fm}---\n${body}` : `---\n${fm}---\n`;
}
