/*
 * API 1.2 end to end: `createNote` and `noteDestinations`, against a live Obsidian.
 *
 *   node tests/e2e/create-note.mjs            (default vault: Obsidian-Dev)
 *   FILECLASS_E2E_VAULT=<name> node tests/e2e/create-note.mjs
 *
 * Needs: Obsidian with `--remote-debugging-port=9222`, the vault open with Fileclass built from this
 * tree, and **Templater** enabled (the rename case and the "same note as the command" case run
 * through it). The window is picked by vault name, never "the first one": several vaults can share
 * the port, and this test writes notes.
 *
 * Every DOM query goes through `activeDocument`, not `document`: Obsidian opens a modal in the window
 * that has focus, and a popped-out Settings window does (measured on 1.15.1) — querying `document`
 * found no modal at all and reported "nothing opened", the one check that must not pass by accident.
 *
 * Everything it writes lives under `_e2e-create/`, three `E2e*` class notes in the class folder,
 * and one note in Obsidian's default new-note folder; all of it is deleted at the end, pass or fail.
 * The schema log keeps the lines the creations wrote — they are what case "log" asserts on.
 *
 * Exit: 0 all passed, 1 a check failed, 2 the harness could not run.
 */
import { connect } from "./cdp.mjs";

const VAULT = process.env.FILECLASS_E2E_VAULT || "Obsidian-Dev";
const ROOT = "_e2e-create";

let failures = 0;
function check(name, cond, detail) {
	console.log(`${cond ? "  ✓" : "  ✗"} ${name}`);
	if (!cond) {
		failures++;
		if (detail !== undefined) console.log(`      ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
	}
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- in-Obsidian code (serialized into the renderer) ----------------------------------------------

/** Installs the fixture and a few helpers on `window.__fce2e`. */
function setup(ROOT) {
	const p = app.plugins.plugins.fileclass;
	const classDir = p.settings.classFilesPath.replace(/\/+$/, "");
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (test, ms = 10000) => {
		for (let t = 0; t < ms; t += 200) {
			const v = await test();
			if (v) return v;
			await wait(200);
		}
		return null;
	};
	const closeModals = async () => {
		// Escape, one modal at a time: this Obsidian draws no close button to click.
		for (let i = 0; i < 10 && activeDocument.querySelector(".modal-container"); i++) {
			(activeDocument.activeElement ?? activeDocument.body).dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })
			);
			await wait(150);
		}
	};
	const field = (name, id, type) => `  - name: ${name}\n    id: ${id}\n    type: ${type}\n    options: {}\n    path: ""\n`;
	const write = async (path, text) => {
		const dir = path.slice(0, path.lastIndexOf("/"));
		if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir).catch(() => {});
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing) await app.vault.modify(existing, text);
		else await app.vault.create(path, text);
	};
	window.__fce2e = {
		classDir,
		wait,
		until,
		closeModals,
		read: async (path) => {
			const f = app.vault.getAbstractFileByPath(path);
			return f ? app.vault.read(f) : null;
		},
		fm: (path) => until(() => {
			const f = app.vault.getAbstractFileByPath(path);
			const fm = f && app.metadataCache.getFileCache(f)?.frontmatter;
			return fm && fm.fileClass ? JSON.parse(JSON.stringify(fm)) : null;
		}, 5000),
		screen: () => ({
			modals: activeDocument.querySelectorAll(".modal-container").length,
			notices: activeDocument.querySelectorAll(".notice").length,
			active: app.workspace.getActiveFile()?.path ?? null,
		}),
		link: (target, from) => app.fileManager.generateMarkdownLink(app.vault.getAbstractFileByPath(target), from),
		filesUnder: (prefix) => app.vault.getFiles().filter((f) => f.path.startsWith(prefix)).map((f) => f.path).sort(),
	};

	return (async () => {
		await closeModals();
		const before = window.__fce2e.screen();
		window.__fce2e.initialActive = before.active;
		await write(`${ROOT}/Bands/AC-DC.md`, "# AC/DC\n");
		await write(`${ROOT}/Bands/Queen.md`, "# Queen\n");
		await write(
			`${ROOT}/Templates/Song.md`,
			"---\ngenre: Template genre\nalbum: From template\n---\n\n## Lyrics of <% tp.file.title %>\n"
		);
		await write(
			`${ROOT}/Templates/Artist.md`,
			'---\nrole: Artist\n---\n\n## Bio\n<%* await tp.file.rename(tp.file.title + " (artist)") %>\n'
		);
		await write(
			`${classDir}/E2eSong.md`,
			`---\nnewNotes:\n  - name: Song\n    folder: ${ROOT}/Songs\n    template: ${ROOT}/Templates/Song.md\nfields:\n` +
				field("artists", "e2eAr1", "MultiFile") +
				field("producer", "e2ePr1", "File") +
				field("genre", "e2eGe1", "Input") +
				field("album", "e2eAl1", "Input") +
				field("year", "e2eYe1", "Number") +
				"---\n"
		);
		await write(
			`${classDir}/E2ePerson.md`,
			`---\nnewNotes:\n  - name: Professional\n    folder: ${ROOT}/People/Work\n  - name: Artist\n    folder: ${ROOT}/People/Artists\n    template: ${ROOT}/Templates/Artist.md\n  - name: Ghost\n    folder: ${ROOT}/People/Ghosts\n    template: ${ROOT}/Templates/Missing.md\nfields:\n` +
				field("role", "e2eRo1", "Input") +
				field("company", "e2eCo1", "Input") +
				"---\n"
		);
		await write(`${classDir}/E2eBare.md`, "---\nfields:\n" + field("remark", "e2eRe1", "Input") + "---\n");
		const indexed = await until(
			() =>
				p.index.getResolvedFields("E2eSong").length === 5 &&
				p.index.getResolvedFields("E2ePerson").length === 2 &&
				p.index.getResolvedFields("E2eBare").length === 1
		);
		return {
			indexed: !!indexed,
			templater: !!app.plugins.plugins["templater-obsidian"],
			defaultFolder: app.vault.getConfig("newFileLocation") === "folder" ? app.vault.getConfig("newFileFolderPath") : "",
			openFieldsOnCreate: p.settings.openFieldsOnCreate,
			logEnabled: p.settings.enableSchemaLog,
		};
	})();
}

function teardown(ROOT, extra) {
	const h = window.__fce2e;
	return (async () => {
		await h?.closeModals();
		const del = async (path) => {
			const f = app.vault.getAbstractFileByPath(path);
			if (f) await app.vault.delete(f, true).catch(() => {});
		};
		for (const path of extra) await del(path);
		await del(ROOT);
		for (const c of ["E2eSong", "E2ePerson", "E2eBare"]) await del(`${h?.classDir ?? ""}/${c}.md`);
		const back = h?.initialActive && app.vault.getAbstractFileByPath(h.initialActive);
		if (back) await app.workspace.getLeaf(false).openFile(back);
		delete window.__fce2e;
		return true;
	})();
}

// --- main -----------------------------------------------------------------------------------------

async function main() {
	let session;
	try {
		session = await connect({ vault: VAULT });
	} catch (err) {
		console.error(err.message);
		process.exit(2);
	}
	const { evaluate, close } = session;
	const cleanup = [];
	try {
		const vault = await evaluate(() => app.vault.getName());
		if (vault !== VAULT) throw new Error(`connected to "${vault}", expected "${VAULT}"`);
		console.log(`vault: ${vault}`);

		const env = await evaluate(setup, ROOT);
		if (!env.indexed || !env.templater) {
			console.error("Fixture not ready:", JSON.stringify(env));
			process.exitCode = 2;
			return;
		}
		const api = (method, ...args) =>
			evaluate((m, a) => app.plugins.plugins.fileclass.api[m](...a), method, args);
		const screen = () => evaluate(() => window.__fce2e.screen());

		console.log("\nVersion and the 1.1 surface:");
		const surface = await evaluate(() => {
			const a = app.plugins.plugins.fileclass.api;
			const v11 = ["vaultInfo", "listFileClasses", "getSchema", "explain", "getFields", "getValue",
				"allowedValues", "fileCandidates", "listNotes", "baseTable", "openSchema", "validate", "setValue",
				"clearValue", "insertMissing", "setValueWhere", "previewValueWhere", "applyValueWhere", "applyValueToPaths"];
			return { version: a.version, missing: v11.filter((m) => typeof a[m] !== "function") };
		});
		check('api.version === "1.2"', surface.version === "1.2", surface.version);
		check("every 1.1 method is still there", surface.missing.length === 0, surface.missing);
		const summary = (await api("listFileClasses")).find((c) => c.name === "E2eSong");
		check("a 1.1 call answers as before (listFileClasses)", summary && summary.fieldCount === 5, summary);
		const schema = await api("getSchema", "E2eSong");
		check("a 1.1 call answers as before (getSchema)", same(Object.keys(schema ?? {}), ["name", "ancestors", "options", "fields"]), schema);

		console.log("\nnoteDestinations:");
		const dests = await api("noteDestinations", "E2ePerson");
		check("declared order, with names, folders and templates", same(dests?.map((d) => d.name), ["Professional", "Artist", "Ghost"]) &&
			dests[1].template === `${ROOT}/Templates/Artist.md`, dests);
		check("[] for a class without destinations", same(await api("noteDestinations", "E2eBare"), []));
		check("null for an unknown class", (await api("noteDestinations", "NoSuchClass")) === null);

		console.log("\nNominal creation (single destination, template, open: false):");
		const quiet = await screen();
		const twin = await api("createNote", { fileClass: "E2eSong", name: "Api Twin", open: false });
		const twinPath = `${ROOT}/Songs/Api Twin.md`;
		check("ok, at the destination's folder", twin.ok && twin.path === twinPath && !twin.warnings, twin);
		const twinRaw = await evaluate((p) => window.__fce2e.read(p), twinPath);
		const twinFm = await evaluate((p) => window.__fce2e.fm(p), twinPath);
		check("one frontmatter block, at the top, template body kept and run by Templater",
			twinRaw?.startsWith("---\n") && (twinRaw.match(/^---$/gm) ?? []).length === 2 && twinRaw.includes("## Lyrics of Api Twin"), twinRaw);
		check("fileClass written, template values kept", twinFm?.fileClass === "E2eSong" && twinFm.genre === "Template genre" && twinFm.album === "From template", twinFm);
		check("missing fields inserted", twinFm && ["artists", "producer", "year"].every((k) => k in twinFm), twinFm);
		const afterQuiet = await screen();
		check("open: false opens nothing (no note, no modal, no notice)", same(quiet, afterQuiet), { quiet, afterQuiet });

		console.log("\nSame note as the command, for the same choices:");
		const cmd = await evaluate(async (classNote) => {
			const h = window.__fce2e;
			await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(classNote));
			await h.wait(800);
			app.commands.executeCommandById("fileclass:create-note");
			const input = await h.until(() => activeDocument.querySelector(".modal-container input"), 4000);
			if (!input) return "no name prompt";
			input.value = "Cmd Twin";
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			await h.until(() => activeDocument.querySelector(".fileclass-field-row"), 5000);
			await h.closeModals();
			return "done";
		}, `${(await evaluate(() => window.__fce2e.classDir))}/E2eSong.md`);
		const cmdPath = `${ROOT}/Songs/Cmd Twin.md`;
		await evaluate((p) => window.__fce2e.fm(p), cmdPath);
		const cmdRaw = await evaluate((p) => window.__fce2e.read(p), cmdPath);
		check("the command created its note", cmd === "done" && cmdRaw !== null, cmd);
		check("byte-identical to the API's, names aside", cmdRaw?.replaceAll("Cmd Twin", "Api Twin") === twinRaw, { cmdRaw, twinRaw });

		console.log("\nDestinations:");
		const pro = await api("createNote", { fileClass: "E2ePerson", name: "Jane Roe", destination: "professional", open: false });
		check("chosen by name, case-insensitive", pro.ok && pro.path === `${ROOT}/People/Work/Jane Roe.md`, pro);
		const before = await evaluate((r) => window.__fce2e.filesUnder(r), ROOT);
		const unknown = await api("createNote", { fileClass: "E2ePerson", name: "Jane Roe 2", destination: "Friend", open: false });
		check("unknown destination: ok false, the class's destinations listed",
			!unknown.ok && /Professional, Artist, Ghost/.test(unknown.message ?? ""), unknown);
		check("…and nothing created", same(before, await evaluate((r) => window.__fce2e.filesUnder(r), ROOT)));
		const bare = await api("createNote", { fileClass: "E2eBare", name: "E2e Bare Note", open: false });
		const barePath = `${env.defaultFolder ? `${env.defaultFolder.replace(/\/+$/, "")}/` : ""}E2e Bare Note.md`;
		if (bare.path) cleanup.push(bare.path);
		check("a class without destinations: Obsidian's default folder", bare.ok && bare.path === barePath, { bare, barePath });
		const bareNamed = await api("createNote", { fileClass: "E2eBare", name: "E2e Bare Two", destination: "Work", open: false });
		check("…and a destination named for it is refused", !bareNamed.ok && /declares no destination/.test(bareNamed.message ?? ""), bareNamed);

		console.log("\nAn existing note:");
		const stamp = await evaluate((p) => {
			const f = app.vault.getAbstractFileByPath(p);
			return { mtime: f.stat.mtime, size: f.stat.size };
		}, twinPath);
		const again = await api("createNote", { fileClass: "E2eSong", name: "Api Twin", open: false });
		check("ok false, with the existing path and a message", !again.ok && again.path === twinPath && /already exists/.test(again.message ?? ""), again);
		const lower = await api("createNote", { fileClass: "E2eSong", name: "api twin", open: false });
		check("the same name in another case is the same note", !lower.ok && lower.path === twinPath, lower);
		const after = await evaluate((p) => {
			const f = app.vault.getAbstractFileByPath(p);
			return { mtime: f.stat.mtime, size: f.stat.size, numbered: !!app.vault.getAbstractFileByPath(p.replace(".md", " 1.md")) };
		}, twinPath);
		check("nothing created, nothing modified", after.mtime === stamp.mtime && after.size === stamp.size && !after.numbered, { stamp, after });

		console.log("\nSeeds:");
		const seeded = await api("createNote", {
			fileClass: "E2eSong",
			name: "Highway to Hell",
			open: false,
			seeds: [
				{ field: "artists", linkTo: ["AC-DC", `${ROOT}/Bands/Queen.md`, "Nobody"] },
				{ field: "producer", linkTo: "[[AC-DC]]" },
				{ field: "genre", value: "Hard rock" },
				{ field: "album", value: ["Highway to Hell", "Live"] },
				{ field: "mood", value: "loud" },
			],
		});
		const songPath = `${ROOT}/Songs/Highway to Hell.md`;
		check("created despite two inapplicable seeds", seeded.ok && seeded.path === songPath, seeded);
		check("the two go to warnings (unknown field, unresolved link)",
			seeded.warnings?.length === 2 && seeded.warnings.some((w) => w.includes('"mood"')) && seeded.warnings.some((w) => w.includes('"Nobody"')), seeded.warnings);
		const songFm = await evaluate((p) => window.__fce2e.fm(p), songPath);
		const links = await evaluate((r, from) => ({
			acdc: window.__fce2e.link(`${r}/Bands/AC-DC.md`, from),
			queen: window.__fce2e.link(`${r}/Bands/Queen.md`, from),
		}), ROOT, songPath);
		check("linkTo by name and by path, as a list of links", same(songFm?.artists, [links.acdc, links.queen]), { got: songFm?.artists, links });
		check("linkTo on a single field, wrapping removed", songFm?.producer === links.acdc, songFm?.producer);
		check("a seed overwrites the template's value", songFm?.genre === "Hard rock", songFm?.genre);
		check("a list value stays a list", same(songFm?.album, ["Highway to Hell", "Live"]), songFm?.album);
		check("an unknown field is not written", songFm && !("mood" in songFm), songFm);

		const malformed = await api("createNote", {
			fileClass: "E2eSong",
			name: "Malformed Seeds",
			open: false,
			seeds: [{ field: "artists", linkTo: [42] }, null, { field: "genre", value: "Rock" }],
		});
		check("a seed of the wrong shape: no throw, ok, said in warnings (reported by vault-agents)",
			malformed.ok && malformed.warnings?.length === 2, malformed);
		const notAList = await api("createNote", { fileClass: "E2eSong", name: "Seeds Not A List", open: false, seeds: "genre=Rock" });
		check("seeds that are not a list: ok, said in warnings", notAList.ok && notAList.warnings?.length === 1, notAList);

		console.log("\nTemplates:");
		const renamed = await api("createNote", { fileClass: "E2ePerson", name: "John Doe", destination: "Artist", open: false });
		const renamedPath = `${ROOT}/People/Artists/John Doe (artist).md`;
		check("Templater's rename: path is the final path", renamed.ok && renamed.path === renamedPath, renamed);
		const renamedFm = await evaluate((p) => window.__fce2e.fm(p), renamedPath);
		const original = await evaluate((p) => !!app.vault.getAbstractFileByPath(p), `${ROOT}/People/Artists/John Doe.md`);
		check("…and the class landed on the renamed note", renamedFm?.fileClass === "E2ePerson" && renamedFm.role === "Artist" && !original, { renamedFm, original });
		const ghostQuiet = await screen();
		const ghost = await api("createNote", { fileClass: "E2ePerson", name: "Casper", destination: "Ghost", open: false });
		check("a failing template does not fail the creation, and goes to warnings",
			ghost.ok && ghost.warnings?.some((w) => w.includes("Missing.md")), ghost);
		check("…without a Notice", same(ghostQuiet, await screen()));

		console.log("\nRefusals:");
		const noClass = await api("createNote", { fileClass: "NoSuchClass", name: "X" });
		check('unknown class: `Unknown fileClass "NoSuchClass"`', !noClass.ok && noClass.message === 'Unknown fileClass "NoSuchClass"', noClass);
		const empty = await api("createNote", { fileClass: "E2eSong", name: " //:: ", open: false });
		check("a name empty once cleaned is refused", !empty.ok && !empty.path, empty);

		console.log("\nopen (default true):");
		const opened = await api("createNote", { fileClass: "E2ePerson", name: "Open Me", destination: "Professional" });
		const shown = await evaluate(async () => {
			const h = window.__fce2e;
			const fields = await h.until(() => activeDocument.querySelector(".modal-container .fileclass-field-row"), 4000);
			const out = { ...h.screen(), fieldsModal: !!fields };
			await h.closeModals();
			return out;
		});
		check("the note is opened", opened.ok && shown.active === opened.path, { opened, shown });
		if (env.openFieldsOnCreate) check("then the fields modal, and that is the only window", shown.fieldsModal && shown.modals === 1, shown);
		else console.log("  · openFieldsOnCreate is off in this vault: the fields-modal half was not attempted");

		console.log("\nLog:");
		if (!env.logEnabled) console.log("  · the schema log is off in this vault: not attempted");
		else {
			const lines = await evaluate(async () => {
				const h = window.__fce2e;
				await h.wait(1000);
				const raw = await app.vault.adapter.read(`${h.classDir}/fileclass.log`).catch(() => "");
				return raw.split("\n").filter((l) => l.includes("schema.note-created") && /(Api|Cmd) Twin/.test(l)).slice(-2);
			});
			check("schema.note-created with via: api / via: command",
				lines.some((l) => l.includes("Api Twin") && /via\W+api/.test(l)) && lines.some((l) => l.includes("Cmd Twin") && /via\W+command/.test(l)), lines);
		}
	} catch (err) {
		console.error(`Harness error: ${err.message}`);
		process.exitCode = 2;
	} finally {
		await evaluate(teardown, ROOT, cleanup).catch((e) => console.error(`cleanup failed: ${e.message}`));
		close();
	}
	if (failures) {
		console.log(`\n${failures} check(s) failed.`);
		process.exitCode = 1;
	} else if (!process.exitCode) console.log("\nAll checks passed.");
}

main();
