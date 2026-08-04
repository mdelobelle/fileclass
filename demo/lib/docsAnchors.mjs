/*
 * Does a scenario's `doc:` point at a heading that exists?
 *
 * Why this exists: take 023 was published with `doc: "schema/#required-fields"` while the
 * section lives in `fields.md`. That value goes into the **YouTube description**, so the
 * mistake left the site through a channel nobody re-reads — and it took a docs build to
 * notice. Reading the markdown is enough to catch it before recording.
 *
 * The slugs are computed the way Hugo's goldmark does (GitHub-style), and the rule was
 * checked against every heading of the built site rather than trusted from the docs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A heading's anchor, GitHub-style: lowercased, punctuation dropped, runs of
 * separators turned into single dashes — and, notably, a dropped `(`/`)`/`/` leaves the
 * spaces around it, so `Nested fields (Object / ObjectList)` yields
 * `nested-fields-object--objectlist` with its double dash.
 */
export function slugify(heading) {
	return heading
		.trim()
		.toLowerCase()
		.replace(/`/g, "")
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s/g, "-")
		.replace(/-{3,}/g, "--");
}

/** Anchors per docs page: `{ "fields": Set("required-fields", …), … }`. */
export function collectAnchors(contentDir) {
	const anchors = {};
	for (const file of readdirSync(contentDir)) {
		if (!file.endsWith(".md")) continue;
		const page = file === "_index.md" ? "" : file.replace(/\.md$/, "");
		const set = new Set();
		let inCode = false;
		for (const line of readFileSync(join(contentDir, file), "utf8").split("\n")) {
			if (line.startsWith("```")) inCode = !inCode;
			if (inCode) continue;
			const m = line.match(/^(#{2,4})\s+(.*)$/);
			if (m) set.add(slugify(m[2]));
		}
		anchors[page] = set;
	}
	return anchors;
}

/**
 * Checks a scenario's `doc:` value (`fields/#required-fields`, or `fields/` for a page).
 * Returns `{ ok, message }`; an empty `doc` is not an error — a take may have no page.
 */
export function checkDocRef(doc, anchors) {
	if (!doc) return { ok: true, message: "no doc: key" };
	const [pagePart, anchor] = String(doc).split("#");
	const page = pagePart.replace(/^\/+|\/+$/g, "");
	if (!(page in anchors)) {
		const known = Object.keys(anchors).filter(Boolean).sort().join(", ");
		return { ok: false, message: `no docs page "${page}" (have: ${known})` };
	}
	if (!anchor) return { ok: true, message: `page "${page}"` };
	if (!anchors[page].has(anchor)) {
		// Name the page that does have it — that was exactly take 023's mistake.
		const elsewhere = Object.entries(anchors)
			.filter(([, set]) => set.has(anchor))
			.map(([p]) => p || "(home)");
		const hint = elsewhere.length ? ` — it is in ${elsewhere.join(", ")}` : "";
		return { ok: false, message: `"${page}" has no anchor "#${anchor}"${hint}` };
	}
	return { ok: true, message: `${page}/#${anchor}` };
}
