/*
 * Canary tests (ARCHITECTURE.md §14) — run at every Obsidian upgrade.
 *
 *   (1) basesAdapter verification protocol: a known fixture .base returns the
 *       expected file set and sorted/grouped rows.
 *   (2) processFrontMatter order-preservation (§3.2).
 *
 * If a canary fails on a new Obsidian version, `src/engine/basesAdapter.ts` is
 * the ONLY file expected to change. This runner drives a live dev Obsidian over
 * CDP (see cdp.mjs) opened on tests/e2e/fixture-vault/ with the Fileclass
 * plugin enabled.
 *
 * The in-Obsidian functions below intentionally replicate the adapter's exact
 * private-call sequence rather than importing it (the bundled plugin does not
 * expose the adapter yet — that arrives with the public API in P5, at which
 * point this should call `app.plugins.plugins.fileclass.api`). Because the
 * sequence is byte-identical to basesAdapter, any Obsidian-internals drift
 * breaks both together — which is precisely what this canary must catch.
 *
 * Usage: npm run test:e2e   (Obsidian must be running with remote debugging)
 */
import { connect } from "./cdp.mjs";

const FIXTURE_BASE = "canary.base";
const ORDER_NOTE = "Notes/order-note.md";
const EXPECTED_ROW_ORDER = ["Alpha", "Gamma", "Beta"]; // rating DESC, then name ASC
const EXPECTED_GROUP_KEYS = ["read", "reading"]; // status ASC
const EXPECTED_GROUP_MEMBERS = { read: ["Alpha", "Gamma"], reading: ["Beta"] };
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

// Replicates basesAdapter.getBaseRows headlessly (no leaf, no DOM attachment).
function runBaseRows(basePath, viewName) {
	const baseFile = app.vault.getFileByPath(basePath);
	if (!baseFile) throw new Error("Base not found: " + basePath);
	const creator = app.embedRegistry.embedByExtension["base"];
	if (!creator) throw new Error("Core Bases plugin inactive");
	const embed = creator({ app, containerEl: createDiv(), sourcePath: basePath }, baseFile, "");
	const ctrl = embed.controller;
	return embed.loadQuery().then((query) => {
		const cfg = query.getViewConfig(viewName || null);
		if (!cfg) throw new Error("View not found: " + viewName);
		ctrl.query = query;
		ctrl.viewName = cfg.name;
		const ctx = ctrl.buildBasesContext(cfg.filters);
		ctrl.ctx = ctx;
		const EntryCls = new ctx.constructor(app, null, {}, baseFile)._local.constructor;
		for (const f of app.vault.getFiles()) {
			if (app.metadataCache.isUserIgnored(f.path)) continue;
			try {
				const entry = new EntryCls(ctx, f);
				if (!ctx.filter || ctx.filter.test(entry)) ctrl.results.set(f, entry);
			} catch (e) {
				/* excluded, like native */
			}
		}
		const factory = app.internalPlugins
			.getPluginById("bases")
			.instance.getViewFactory("table");
		const view = factory(ctrl, ctrl.viewContainerEl);
		view.config = cfg;
		ctrl.view = view;
		ctrl.initialScan = false;
		ctrl.notifyView();
		const ds = view.data;
		const columns = ds.properties;
		const nullSentinel = ds.data.length
			? ds.data[0].getValue("note.__null_probe__")
			: null;
		const toRow = (entry) => {
			const values = {};
			for (const id of columns) {
				let v = null;
				try {
					v = entry.getValue(id);
				} catch (e) {
					/* unreadable → null */
				}
				values[id] = v == null || v === nullSentinel ? null : v.toString();
			}
			return { name: entry.file.basename, values };
		};
		return {
			columns,
			rows: ds.data.map(toRow),
			groups: cfg.groupBy
				? ds.groupedData.map((g) => ({
						key: g.hasKey() ? String(g.key) : null,
						names: g.entries.map((e) => e.file.basename),
				  }))
				: null,
		};
	});
}

// Writes one frontmatter value then reads back the raw file to inspect order.
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

		console.log("\nCanary #1 — basesAdapter fixture (getBaseRows):");
		const r = await evaluate(runBaseRows, FIXTURE_BASE, "Books by status");
		const names = r.rows.map((row) => row.name);
		check(
			"matching file set = {Alpha, Beta, Gamma}",
			eqArr([...names].sort(), ["Alpha", "Beta", "Gamma"]),
			`got ${JSON.stringify(names)}`
		);
		check("rows sorted rating DESC, name ASC", eqArr(names, EXPECTED_ROW_ORDER),
			`got ${JSON.stringify(names)}`);
		check("group keys = status ASC", eqArr(r.groups?.map((g) => g.key), EXPECTED_GROUP_KEYS),
			`got ${JSON.stringify(r.groups?.map((g) => g.key))}`);
		if (r.groups) {
			for (const g of r.groups) {
				check(
					`group "${g.key}" members`,
					eqArr(g.names, EXPECTED_GROUP_MEMBERS[g.key]),
					`got ${JSON.stringify(g.names)}`
				);
			}
		}
		// Column values resolve (rating/status readable through entry.getValue).
		const ratingCol = r.columns.find((c) => c.endsWith("rating"));
		const alpha = r.rows.find((row) => row.name === "Alpha");
		check("rating column resolved for Alpha = 5", ratingCol && alpha?.values[ratingCol] === "5",
			`col=${ratingCol} val=${alpha?.values[ratingCol]}`);

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
