/*
 * Seeds a self-contained demo vault for the onboarding video.
 *
 *   node seed.mjs --vault ./demo-vault
 *
 * It (re)creates the vault from scratch: installs the built Fileclass plugin,
 * enables it, sets its settings, and drops a few plain notes to structure live
 * in the recording. The plugin build is taken from the parent folder (run
 * `npm run build` in the plugin first). Bases is a core plugin — make sure it's
 * enabled in the demo vault (it is by default on Obsidian 1.13+).
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, ".."); // the fileclass plugin repo root

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Default OUTSIDE any vault — a vault nested inside another vault can't be opened.
const vault = resolve(arg("vault", join(homedir(), "fileclass-demo-vault")));
const dot = join(vault, ".obsidian");
const pluginOut = join(dot, "plugins", "fileclass");

console.log(`Seeding demo vault at ${vault}`);
rmSync(vault, { recursive: true, force: true });
mkdirSync(pluginOut, { recursive: true });

// --- install the built plugin ------------------------------------------------
for (const f of ["main.js", "manifest.json", "styles.css"]) {
	const src = join(pluginDir, f);
	if (!existsSync(src)) throw new Error(`Missing ${f} — run \`npm run build\` in the plugin first.`);
	cpSync(src, join(pluginOut, f));
}

const write = (rel, data) =>
	writeFileSync(join(vault, rel), typeof data === "string" ? data : JSON.stringify(data, null, 2));

// --- Obsidian config ---------------------------------------------------------
write(".obsidian/community-plugins.json", ["fileclass"]);
// A clean, legible look for video. Adjust to taste.
write(".obsidian/appearance.json", { baseFontSize: 18, theme: "obsidian" });
write(".obsidian/app.json", { promptDelete: false });
// Fileclass settings: fileClasses live in Classes/.
write(".obsidian/plugins/fileclass/data.json", { classFilesPath: "Classes/" });

// --- content -----------------------------------------------------------------
mkdirSync(join(vault, "Classes"), { recursive: true });
mkdirSync(join(vault, "Library"), { recursive: true });

// A ready-made "Book" fileClass with visual field types (Select / Number /
// Color / Icon / Date) — the recording binds a note to it and fills the values.
write(
	"Classes/Book.md",
	`---
icon: book
mapWithTag: false
fields:
  - name: status
    id: fcStatus
    type: Select
    path: ""
    options:
      sourceType: ValuesList
      valuesList:
        "1": Reading list
        "2": Reading
        "3": Read
        "4": Abandoned
  - name: rating
    id: fcRating
    type: Number
    path: ""
    options:
      min: 0
      max: 5
  - name: cover
    id: fcCover
    type: Color
    path: ""
    options: {}
  - name: icon
    id: fcIcon
    type: Icon
    path: ""
    options: {}
  - name: read
    id: fcRead
    type: Date
    path: ""
    options: {}
---

The **Book** fileClass — status, rating, cover color, icon, read date.
`
);

// A few book notes with plain frontmatter (no fileClass yet) — the live demo
// gives them structure by creating a "Book" fileClass and binding them.
const books = [
	{ title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", year: 1969 },
	{ title: "Dune", author: "Frank Herbert", year: 1965 },
	{ title: "Kindred", author: "Octavia E. Butler", year: 1979 },
];
for (const b of books) {
	write(
		`Library/${b.title}.md`,
		`---\ntitle: ${b.title}\nauthor: ${b.author}\nyear: ${b.year}\n---\n\n# ${b.title}\n\nby ${b.author}\n`
	);
}

// A short welcome note to open first in the recording.
write(
	"Welcome.md",
	`# Fileclass — quick tour\n\nA schema for your frontmatter: typed, validated properties with guided input.\n\nWe'll create a **Book** fileClass, structure the notes in \`Library/\`, and generate a table.\n`
);

console.log(`\nDone. Vault: ${vault}\n`);
console.log("Next (see README.md):");
console.log("  1. In Obsidian → Open another vault → Open folder as vault → pick the folder above (once).");
console.log("  2. Turn off Restricted mode (trust) so the Fileclass + Bases plugins load.");
console.log("  3. Quit Obsidian, then relaunch it with remote debugging:");
console.log("       open -na Obsidian --args --remote-debugging-port=9222");
console.log("     (it reopens the last vault = this one; if not, switch to it in the vault picker).");
console.log("  4. node record.mjs");
