/*
 * Drives Obsidian through the onboarding scenario over CDP.
 *
 *   node record.mjs        # run all steps
 *   node record.mjs 1      # run only step 1 (install + configure)
 *   node record.mjs 2      # run only step 2 (create a fileClass + author notes)
 *   node record.mjs 3      # run only step 3 (base table + linked Book class)
 *
 * Launch Obsidian on the seeded vault (plugin pre-installed) with
 * --remote-debugging-port=9222, start your screen recording, then run this.
 * Steps are independent so you can iterate/tune one at a time. The in-modal
 * clicks (schema editor, pickers) are the parts most likely to need a light
 * selector/timing tuning pass.
 *
 * MANUAL CLICKS: the driver never clicks — it types, sets <select>/date values,
 * and detects results, but every MOUSE click is yours so you control the
 * pointer's timing. When the caption turns purple and ends with "…", do the
 * named click (a button, a pencil ✎, a palette row, a right-click menu item, a
 * list option); the driver watches the DOM and resumes once it takes effect.
 * (The right-click menu in particular renders in a separate window the debug
 * port can't reach, so it could never be driven anyway.) Add a visible pointer
 * in post if you like — there's no fake cursor in the run.
 */
import { connectObsidian, sleep } from "./lib/driver.mjs";

const beat = (ms = 450) => sleep(ms);
// Safety: only ever drive the demo vault (override with FILECLASS_DEMO_VAULT).
const EXPECT_VAULT = process.env.FILECLASS_DEMO_VAULT || "fileclass-demo-vault";
const d = await connectObsidian();

const AUTHORS = [
	// Two entry points to the same three actions (add fileClass, insert missing
	// fields, manage note fields) — so the video teaches both:
	//   author 1 → the command palette (driver opens it; you click the row),
	//   author 2 → the file's right-click menu (you right-click, then click).
	// `blurb` is the on-screen story line shown when the note is created.
	{ name: "Frank Herbert", birthdate: "1920-10-08", country: "UK", mode: "palette",
		blurb: "Our first author — we'll tag Frank from the command palette" },
	{ name: "Arnaldur Indriðason", birthdate: "1961-01-28", country: "Iceland", mode: "menu",
		blurb: "A second author — Arnaldur, this time from the right-click menu" },
];
const COUNTRIES = ["USA", "UK", "Iceland"];

// --- Step 1: install (pre-staged) + create Classes/ + configure it -----------
// The live store install opens several separate windows in this build — too
// jumpy for a clean recording — so the plugin is pre-installed (seed.mjs) and
// this shows a caption. The folder + setting ARE shown on camera.
async function step1() {
	await d.step("Fileclass turns plain notes into typed, structured data — no code");
	await beat(1600);

	// Create the folder that will hold fileClass notes (appears in the explorer),
	// and expand it so the Author fileClass is visible inside it once created.
	await d.step("First, a home for your classes — the Classes/ folder");
	await d.eval(() => window.app.vault.createFolder("Classes").catch(() => { }));
	await beat(1000);
	await d.eval(() => {
		const view = window.app.workspace.getLeavesOfType("file-explorer")[0]?.view;
		view?.fileItems?.["Classes"]?.setCollapsed?.(false);
	});
	await beat(1000);

	// Point Fileclass at that folder (Settings → Fileclass → Class files folder).
	await d.step("Tell Fileclass where they live, and you're set up");
	await d.eval(() => {
		window.app.setting.open();
		window.app.setting.openTabById("fileclass");
	});
	await d.useSettingsWindow();
	await beat(1000);
	await d.fill(".vertical-tab-content input[type='text']", "Classes", { nth: 0 });
	await d.press("Escape"); // dismiss the folder autocomplete
	await beat(550);
	await d.useMainWindow();
	await d.eval(() => window.app.setting.close());
	await beat(2000);
	await d.step("");
}

// --- Step 2: create an Author fileClass, then two author notes ---------------
// Every mouse click is yours (purple caption + `…`); the driver types, sets
// <select>/date values, and detects each click's effect in the DOM.
async function step2() {
	await resetStep2Artifacts(); // idempotent: a re-run starts from a clean slate

	// Create the fileClass from the command palette (you click the command);
	// then the PromptModal — name typed, Enter submits.
	await d.step("Every structure starts with a type. Let's define an Author");
	await d.openPalette("Fileclass"); // driver opens + filters (keyboard)
	await d.clickHandoff(
		"In the palette, run “Create a class”",
		() => !!document.querySelector(".modal input[type='text']")
	);
	await beat(300);
	await d.type("Author");
	await d.press("Enter");
	await d.awaitInPage(() =>
		[...document.querySelectorAll(".modal button")].some((b) => b.textContent.includes("Add field"))
	);
	await beat(400);

	// Field: birthdate (Date)
	await d.step("An author has a birthday — give it a typed Date field");
	await addField("birthdate", "Date", "Add the first field. Click “Add field”");
	await saveFieldDef();
	await beat(400);

	// Field: country (Select) with a few values
	await d.step("…and a home country — a Select with a fixed set of values");
	await addField("country", "Select", "Add another field. Click “Add field”");
	for (const c of COUNTRIES) {
		const before = await d.eval(() => {
			const m = [...document.querySelectorAll(".modal")].pop();
			return m ? m.querySelectorAll("input[type='text']").length : 0;
		});
		await d.clickHandoff(
			"List a country. Click “Add value”",
			(n) => {
				const m = [...document.querySelectorAll(".modal")].pop();
				return !!m && m.querySelectorAll("input[type='text']").length > n;
			},
			{ args: [before] }
		);
		await beat(150);
		await d.fill(".modal input[type='text']", c, { modal: true, nth: -1, clear: false });
	}
	await beat(250);
	await saveFieldDef();
	await beat(400);
	await d.press("Escape"); // close the schema editor (keyboard)
	await beat(400);
	await d.step("");

	// Two author notes, filled through the note-fields modal.
	for (const a of AUTHORS) {
		await fillAuthor(a);
	}

	await d.step("Two authors, fully typed — and we never wrote a line of code");
	await beat(1600);
	await d.step("");
}

// --- Step 3: a Bases table for Author, a live edit, and a linked Book ---------
// Builds on step 2's artifacts (the Author fileClass + author notes). Shows the
// fileClass → base table, editing a field reflected in it, and a File field on
// a new Book fileClass whose candidates come from the Author table.
async function step3() {
	const ready = await d.eval(() => {
		const idx = window.app.plugins.plugins.fileclass.index;
		return idx.fileClassNames.includes("Author") && !!window.app.vault.getAbstractFileByPath("Frank Herbert.md");
	});
	if (!ready) throw new Error("Step 3 needs step 2's artifacts — run `node record.mjs 2` first.");
	await resetStep3Artifacts();

	// 3.1 — Create a Bases table for Author, from the fileClass's right-click menu.
	await d.step("Structure you can see — turn the class into a Bases table");
	await revealPath("Classes/Author.md");
	await d.handoff("Right-click “Author” (in Classes/) → Create a base for this fileClass");
	await d.awaitInPage(() =>
		[...document.querySelectorAll(".modal")].some((m) =>
			[...m.querySelectorAll("button")].some((b) => b.textContent.includes("Create / sync"))
		)
	);
	await beat(500);
	await clickToCloseModal("Keep the defaults — click “Create / sync”");
	await d.awaitInPage(() => {
		const idx = window.app.plugins.plugins.fileclass.index;
		const bf = idx.getFileClass("Author")?.options?.baseFile;
		return !!bf && !!window.app.vault.getAbstractFileByPath(bf);
	});
	// Open the table so the next edit is visible on camera.
	await d.eval(async () => {
		const idx = window.app.plugins.plugins.fileclass.index;
		const bf = idx.getFileClass("Author")?.options?.baseFile;
		const f = bf && window.app.vault.getAbstractFileByPath(bf);
		if (f) await window.app.workspace.getLeaf(true).openFile(f);
	});
	await d.step("Your authors as a live table — one row per note");
	await beat(1800);

	// 3.2 — Edit Frank Herbert's country by clicking its cell in the table.
	// Cells in the fileclass-table view are editable: a click opens the field's
	// value editor and the row updates in place.
	await d.step("And it's editable — change a value right in the table");
	const prevCountry = await d.eval(
		() => window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Frank Herbert.md"))?.frontmatter?.country ?? null
	);
	await d.clickHandoff(
		"Click Frank Herbert's country cell",
		() => document.querySelector(".prompt input")?.placeholder === "Set country"
	);
	await d.clickHandoff(
		"Pick a different country — the row updates instantly",
		(prev) => {
			const v = window.app.metadataCache.getFileCache(window.app.vault.getAbstractFileByPath("Frank Herbert.md"))?.frontmatter?.country ?? null;
			return v !== null && v !== prev;
		},
		{ args: [prevCountry] }
	);
	await beat(1500);

	// 3.3 — Create a Book fileClass with an "author" File field sourced from the table.
	await d.step("Classes can link to each other. Let's add a Book");
	await d.openPalette("Fileclass");
	await d.clickHandoff("In the palette, run “Create a class”", () => !!document.querySelector(".modal input[type='text']"));
	await beat(300);
	await d.type("Book");
	await d.press("Enter");
	await d.awaitInPage(() =>
		[...document.querySelectorAll(".modal button")].some((b) => b.textContent.includes("Add field"))
	);
	await beat(400);

	await d.step("Give Book an “author” field that points at real authors");
	await d.clickHandoff("Link Book to Author. Click “Add field”", () => {
		const m = [...document.querySelectorAll(".modal")].pop();
		return !!(m && m.querySelector("select"));
	});
	await beat(300);
	await d.fill(".modal input[type='text']", "author", { modal: true, nth: 0 });
	await beat(200);
	await d.clickHandoff(
		"Select the “File” type",
		(t) => {
			const m = [...document.querySelectorAll(".modal")].pop();
			return !!m && [...m.querySelectorAll("select")].some((s) => s.value === t);
		},
		{ args: ["File"] }
	);
	await beat(400);
	// Point the field at the Author base (blank View = the first/managed view).
	const baseFile = await d.eval(() => window.app.plugins.plugins.fileclass.index.getFileClass("Author")?.options?.baseFile ?? "");
	await d.step("Its choices come straight from the Author table");
	await d.fillSetting("Base file", baseFile);
	await beat(300);
	await saveFieldDef();
	await beat(300);
	await d.press("Escape"); // close the schema editor
	await beat(400);
	await d.step("");

	// 3.4 — A Book note "Dune": add the class, insert fields, pick the author.
	await d.step("A new book joins the library: Dune");
	await d.eval(async () => {
		const f = await window.app.vault.create("Dune.md", "");
		await window.app.workspace.getLeaf(true).openFile(f);
	});
	await beat(500);
	await revealInExplorer("Dune");

	await d.openPalette("Fileclass");
	await d.handoff("In the palette, run “Add a class to this note”");
	await d.awaitInPage(() => document.querySelector(".prompt input")?.placeholder === "Select a fileClass to add");
	await d.clickHandoff("Tag it as a Book — choose “Book”", () => {
		const pl = window.app.plugins.plugins.fileclass;
		const f = window.app.vault.getAbstractFileByPath("Dune.md");
		const v = (window.app.metadataCache.getFileCache(f)?.frontmatter ?? {})[pl.settings.fileClassAlias];
		return Array.isArray(v) ? v.includes("Book") : v === "Book";
	});

	await d.openPalette("Fileclass");
	await d.handoff("In the palette, run “Insert missing fields”");
	await d.awaitInPage(() => {
		const f = window.app.vault.getAbstractFileByPath("Dune.md");
		return "author" in (window.app.metadataCache.getFileCache(f)?.frontmatter ?? {});
	});

	await d.openPalette("Fileclass");
	await d.handoff("In the palette, run “Manage note fields”");
	await d.awaitInPage(() =>
		[...document.querySelectorAll(".modal")].some((m) => m.querySelector(".fileclass-field-row"))
	);

	await d.step("Now link its author — the choices are your Author notes");
	await d.clickHandoff(
		"Open the picker — click ✎ on “author”",
		() => document.querySelector(".prompt input")?.placeholder === "Set author"
	);
	await d.clickHandoff("Choose the author — “Frank Herbert”", () => {
		const f = window.app.vault.getAbstractFileByPath("Dune.md");
		const v = (window.app.metadataCache.getFileCache(f)?.frontmatter ?? {}).author;
		const s = Array.isArray(v) ? v.join(",") : v ?? "";
		return String(s).includes("Frank Herbert");
	});
	await d.press("Escape"); // close the note-fields modal

	await d.step("Dune, by Frank Herbert — a typed, linked library, all in frontmatter");
	await beat(1800);
	await d.step("");
}

/**
 * Resets step 3's artifacts (Book fileClass, Dune, the Author base) and reverts
 * Frank's country to USA, so a re-run is clean and the "Create a base" menu item
 * (not "Modify base") shows again. Safe: guarded by assertVault; only named
 * files touched.
 */
async function resetStep3Artifacts() {
	await d.press("Escape");
	await d.press("Escape");
	await d.eval(async () => {
		const app = window.app;
		const idx = app.plugins.plugins.fileclass.index;
		for (const p of ["Classes/Book.md", "Dune.md"]) {
			const f = app.vault.getAbstractFileByPath(p);
			if (f) await app.vault.delete(f, true);
		}
		const bf = idx.getFileClass("Author")?.options?.baseFile;
		if (bf) {
			const b = app.vault.getAbstractFileByPath(bf);
			if (b) await app.vault.delete(b, true);
		}
		const author = app.vault.getAbstractFileByPath("Classes/Author.md");
		if (author)
			await app.fileManager.processFrontMatter(author, (fm) => {
				delete fm.baseFile;
				delete fm.baseView;
			});
		const frank = app.vault.getAbstractFileByPath("Frank Herbert.md");
		if (frank) await app.fileManager.processFrontMatter(frank, (fm) => (fm.country = "USA"));
	});
	await beat(400);
}

async function fillAuthor({ name, birthdate, country, mode, blurb }) {
	await d.step(blurb);
	await d.eval(async (n) => {
		const f = await window.app.vault.create(`${n}.md`, "");
		await window.app.workspace.getLeaf(true).openFile(f);
	}, name);
	await beat(400);
	await revealInExplorer(name); // put the right-click target on screen

	// (1) Add the Author fileClass — palette (driver opens) or right-click menu.
	await invokeAction(mode, "Add a class to this note", `Right-click “${name}” → Add fileClass`);
	await d.awaitInPage(
		() => document.querySelector(".prompt input")?.placeholder === "Select a fileClass to add"
	);
	await d.clickHandoff(
		"Give the note its type — choose “Author”",
		(p) => {
			const pl = window.app.plugins.plugins.fileclass;
			const f = window.app.vault.getAbstractFileByPath(p);
			const v = (window.app.metadataCache.getFileCache(f)?.frontmatter ?? {})[pl.settings.fileClassAlias];
			return Array.isArray(v) ? v.includes("Author") : v === "Author";
		},
		{ args: [`${name}.md`] }
	);

	// (2) Insert the schema's fields.
	await invokeAction(mode, "Insert missing fields", `Right-click “${name}” → Insert missing fields`);
	await d.awaitInPage(
		(p) => {
			const f = window.app.vault.getAbstractFileByPath(p);
			const fm = window.app.metadataCache.getFileCache(f)?.frontmatter ?? {};
			return "birthdate" in fm && "country" in fm;
		},
		{ args: [`${name}.md`] }
	);

	// (3) Open the note-fields modal.
	await invokeAction(mode, "Manage note fields", `Right-click “${name}” → Manage note fields`);
	await d.awaitInPage(() =>
		[...document.querySelectorAll(".modal")].some((m) => m.querySelector(".fileclass-field-row"))
	);

	// Fill it (same for both authors).
	await d.step(`Now give ${name} some values — guided, typed inputs`);

	// birthdate → Date modal: you click ✎, I set the date, you click Save.
	await d.clickHandoff("Set the birthday — click ✎ on “birthdate”", () =>
		[...document.querySelectorAll(".modal")].some((m) => m.querySelector("input[type='date']"))
	);
	await d.setValue("input[type='date']", birthdate, { modal: true });
	await beat(200);
	// Detect the Date modal closing by modal count (the note-fields modal keeps
	// an inline date input once the value is set, so "no date input" never holds).
	await clickToCloseModal("Save the date. Click “Save”");

	// country → Select suggester: you click ✎, then click the value.
	await d.clickHandoff("Now the country — click ✎ on “country”", () => !!document.querySelector(".prompt input"));
	await d.clickHandoff(
		`Pick from the list — choose “${country}”`,
		(p, c) => {
			const f = window.app.vault.getAbstractFileByPath(p);
			const v = (window.app.metadataCache.getFileCache(f)?.frontmatter ?? {}).country;
			return Array.isArray(v) ? v.includes(c) : v === c;
		},
		{ args: [`${name}.md`, country] }
	);

	await d.press("Escape"); // close the note-fields modal (keyboard)
	await d.step("");
	await beat(400);
}

/** You click "Add field"; the driver types the name; then you pick the type. */
async function addField(name, type, caption) {
	await d.clickHandoff(caption, () => {
		const m = [...document.querySelectorAll(".modal")].pop();
		return !!(m && m.querySelector("select"));
	});
	await beat(300);
	await d.fill(".modal input[type='text']", name, { modal: true, nth: 0 });
	await beat(200);
	// You open the type dropdown and choose the type; resume when it's set.
	await d.clickHandoff(
		`Give it a type — open the dropdown and choose “${type}”`,
		(t) => {
			const m = [...document.querySelectorAll(".modal")].pop();
			return !!m && [...m.querySelectorAll("select")].some((s) => s.value === t);
		},
		{ args: [type] }
	);
	await beat(300);
}

/** Invokes a note action: via the palette (driver opens; you click) or the menu. */
async function invokeAction(mode, paletteName, menuCaption) {
	if (mode === "palette") {
		await d.openPalette("Fileclass"); // driver opens + filters (keyboard)
		await d.handoff(`In the palette, run “${paletteName}”`);
	} else {
		await d.handoff(menuCaption);
	}
}

/** You click the field-def modal's "Save"; resumes once that modal has closed. */
async function saveFieldDef() {
	await clickToCloseModal("Save the field. Click “Save”");
}

/** Hands off a click that should close the top modal; resumes when it's gone. */
async function clickToCloseModal(caption) {
	const before = await d.eval(() => document.querySelectorAll(".modal").length);
	await d.clickHandoff(caption, (n) => document.querySelectorAll(".modal").length < n, { args: [before] });
}

/**
 * Deletes the artifacts step 2 creates (the Author fileClass note + the author
 * notes), so a re-run starts clean. Without this, re-adding the existing
 * `birthdate` field is rejected as a duplicate and the "Save" never closes.
 * Safe: the runner has already asserted we're in the demo vault, and only these
 * named files are removed.
 */
async function resetStep2Artifacts() {
	await d.press("Escape"); // dismiss any modal/prompt left open by a prior run
	await d.press("Escape");
	const paths = ["Classes/Author.md", ...AUTHORS.map((a) => `${a.name}.md`)];
	await d.eval(async (names) => {
		for (const path of names) {
			const f = window.app.vault.getAbstractFileByPath(path);
			if (f) await window.app.vault.delete(f, true);
		}
	}, paths);
	await beat(300);
}

/** Scrolls a note into view in the file explorer (right-click target). */
async function revealInExplorer(name) {
	await revealPath(`${name}.md`);
}

/** Expands ancestor folders and scrolls the path's item into view. */
async function revealPath(path) {
	await d.eval((p) => {
		const view = window.app.workspace.getLeavesOfType("file-explorer")[0]?.view;
		const parts = p.split("/");
		let acc = "";
		for (let i = 0; i < parts.length - 1; i++) {
			acc = acc ? `${acc}/${parts[i]}` : parts[i];
			view?.fileItems?.[acc]?.setCollapsed?.(false);
		}
		view?.fileItems?.[p]?.selfEl?.scrollIntoView({ block: "center" });
	}, path);
}

// --- runner ------------------------------------------------------------------
const steps = { 1: step1, 2: step2, 3: step3 };
const which = process.argv[2];

try {
	await d.assertVault(EXPECT_VAULT); // abort if not the demo vault — protects real data
	await d.step("");
	await beat(2000); // lead-in after you hit Record
	if (which) {
		if (!steps[which]) throw new Error(`Unknown step "${which}" (use 1, 2 or 3)`);
		await steps[which]();
	} else {
		await step1();
		await step2();
		await step3();
	}
} catch (err) {
	console.error("Scenario failed:", err.message);
	process.exitCode = 1;
} finally {
	await d.close();
}
