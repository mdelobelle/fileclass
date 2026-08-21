/*
 * Canary tests — run at every Obsidian upgrade.
 *
 *   (1) the Bases adapter, as bundled into this plugin, still loads and detects its host;
 *   (2) processFrontMatter order-preservation (ARCHITECTURE.md §3.2).
 *
 * The deep verification of the adapter — filtering, sort, groups, limit, null values, view
 * registration against a fixture base — now belongs to the `obsidian-bases-adapter` package,
 * which runs it against its own published artifact. This file used to replicate that private
 * call sequence in order to check it, which meant the test could only ever agree with itself.
 * What is left here is the question the *plugin* must answer: does the version of the adapter
 * this build pins still work inside this Obsidian?
 *
 * If canary (1) fails, the fix is a new release of obsidian-bases-adapter, then a bump here.
 *
 * Usage: npm run test:e2e   (Obsidian must be running with remote debugging, opened on
 * tests/e2e/fixture-vault/ with the Fileclass plugin enabled).
 */
import { connect } from "./cdp.mjs";

const ORDER_NOTE = "Notes/order-note.md";
const EXPECTED_FM_KEY_ORDER = ["zeta", "alpha", "mike", "bravo", "block"];

// --- assertions -----------------------------------------------------------
let failures = 0;
function check(name, cond, detail) {
	const ok = !!cond;
	console.log(`${ok ? "  ✓" : "  ✗"} ${name}`);
	if (!ok) {
		failures++;
		if (detail !== undefined) console.log(`      ${detail}`);
	}
}
const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b);

// --- in-Obsidian probes (serialized to the renderer) ----------------------

function probeFrontMatterOrder(notePath, key, newValue) {
	const file = app.vault.getAbstractFileByPath(notePath);
	if (!file) throw new Error("Note not found: " + notePath);
	return app.fileManager
		.processFrontMatter(file, (fm) => {
			fm[key] = newValue;
		})
		.then(() => app.vault.read(file))
		.then((content) => {
			const m = content.match(/^---\n([\s\S]*?)\n---/);
			const fmText = m ? m[1] : "";
			const keys = fmText
				.split("\n")
				.filter((l) => /^\S/.test(l) && l.includes(":"))
				.map((l) => l.slice(0, l.indexOf(":")).trim());
			return { keys, hasBlockScalar: /^block:\s*\|/m.test(fmText) };
		});
}

// --- main -----------------------------------------------------------------
async function main() {
	const { evaluate, close } = await connect();
	try {
		// Sanity: the internals the adapter feature-detects are present.
		const detect = await evaluate(function () {
			return {
				embed: typeof app.embedRegistry?.embedByExtension?.["base"] === "function",
				instance:
					typeof app.internalPlugins?.getPluginById?.("bases")?.instance
						?.getViewFactory === "function",
				plugin: !!app.plugins?.plugins?.fileclass,
			};
		});
		console.log("Feature detection:");
		check("Bases embed factory present", detect.embed);
		check("Bases table view factory present", detect.instance);
		check("Fileclass plugin loaded", detect.plugin);

		console.log("\nCanary #1 — the bundled adapter (obsidian-bases-adapter):");
		const adapter = await evaluate(() => {
			const plugin = app.plugins?.plugins?.fileclass;
			return {
				loaded: !!plugin,
				// Set at load from the package's own `isBasesAvailable`.
				basesAvailable: plugin?.basesAvailable ?? null,
				// Set when the package's `registerBasesView` accepted our view type.
				viewRegistered: !!app.internalPlugins
					?.getPluginById?.("bases")
					?.instance?.getViewFactory?.("fileclass-table"),
			};
		});
		check("the packaged adapter reports Bases as available", adapter.basesAvailable === true,
			`got ${JSON.stringify(adapter)}`);
		check("registerBasesView registered the fileclass-table view type", adapter.viewRegistered,
			`got ${JSON.stringify(adapter)}`);
		check(
			"a base-backed feature answers: the editable table renders its rows",
			await evaluate(async () => {
				const leaf = app.workspace.getLeaf(false);
				await leaf.openFile(app.vault.getFileByPath("canary.base"));
				await leaf.setViewState({
					type: "bases",
					state: { file: "canary.base", viewName: "Books by status" },
				});
				await new Promise((r) => setTimeout(r, 4000));
				return document.querySelectorAll(".bases-tr, .fileclass-table tbody tr").length >= 3;
			}),
			"the fixture base shows fewer than its three books"
		);

		console.log("\nCanary #2 — processFrontMatter order preservation (§3.2):");
		const fm = await evaluate(probeFrontMatterOrder, ORDER_NOTE, "mike", Date.now());
		check("top-level key order preserved", eqArr(fm.keys, EXPECTED_FM_KEY_ORDER),
			`got ${JSON.stringify(fm.keys)}`);
		check("block scalar preserved", fm.hasBlockScalar);
	} finally {
		close();
	}

	console.log(`\n${failures === 0 ? "All canaries passed." : failures + " canary check(s) FAILED."}`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("\nCanary run could not complete:\n" + err.message);
	process.exit(2);
});
