/*
 * Drives Obsidian through the onboarding scenario over CDP. Connect first:
 * launch Obsidian on the seeded demo vault with --remote-debugging-port=9222
 * (see README), then `node record.mjs`. Screen-record separately (ffmpeg/OBS).
 *
 * The scenario mostly triggers plugin *commands* (reliable) and clicks the few
 * visual highlights (pickers) by button text. Selectors/timings for the modal
 * steps may need a light tuning pass against your Obsidian version — they're
 * grouped in scenario steps below with generous pauses.
 */
import { connectObsidian, sleep } from "./lib/driver.mjs";

const BOOK = "Dune"; // the Library note we structure on camera
const beat = (ms = 900) => sleep(ms);

const d = await connectObsidian();

try {
	// 1. Open a plain note — "here's an unstructured note".
	await d.step("A plain note — no schema yet");
	await d.page.evaluate((name) => window.app.workspace.openLinkText(name, "", false), BOOK);
	await beat(1600);

	// 2. Bind it to the Book fileClass.
	await d.step("Give it a type: the Book fileClass");
	await d.command("fileclass:add-class-to-note");
	await beat();
	// The class picker (a suggester) is open — pick "Book".
	await d.type("Book", 60);
	await beat();
	await d.press("Enter");
	await beat(1400);

	// 3. Insert the schema's fields into the note.
	await d.step("Insert the fileClass fields");
	await d.command("fileclass:insert-missing-fields-in-current-file");
	await beat(1600);

	// 4. Fill values through the guided inputs (the visual highlights).
	await d.step("Fill values with guided, typed inputs");
	await d.command("fileclass:manage-note-fields");
	await beat(1200);

	// status → Select dropdown (each row exposes a pencil; click "status"'s)
	await clickRowAction("status");
	await beat();
	await d.click(".suggestion-item", { hasText: "Reading" }).catch(() => d.press("Enter"));
	await beat(1200);

	// cover → Color picker (circular swatches)
	await clickRowAction("cover");
	await beat();
	await d.click(".fileclass-color-circle", { nth: 4 }); // a palette color
	await beat(1200);

	// icon → Icon grid
	await clickRowAction("icon");
	await beat();
	await d.type("book", 70);
	await beat();
	await d.click(".fileclass-icon-cell", { nth: 0 });
	await beat(1200);

	// 5. Generate a base and open the table.
	await d.step("Generate a Bases table for this fileClass");
	await d.command("fileclass:create-base");
	await beat(1800);
	await d.command("fileclass:open-base");
	await beat(2500);

	await d.step("Typed, validated, frontmatter-only — try Fileclass");
	await beat(2500);
	await d.step("");
} finally {
	await d.close();
}

/** Clicks the edit (pencil) action on the note-fields row whose name matches. */
async function clickRowAction(fieldName) {
	const box = await d.page.evaluate((name) => {
		const rows = [...document.querySelectorAll(".modal .fileclass-field-row")];
		const row = rows.find((r) => r.querySelector(".setting-item-name")?.textContent?.includes(name));
		const btn = row?.querySelector(".setting-item-control .clickable-icon");
		if (!btn) return null;
		btn.scrollIntoView({ block: "center" });
		const r = btn.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}, fieldName);
	if (box) await d.clickAt(box.x, box.y);
}
