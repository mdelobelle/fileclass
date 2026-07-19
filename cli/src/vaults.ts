/* Lists the vaults Obsidian knows about, from its registry file. Zero deps. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

function registryPath(): string {
	if (process.platform === "darwin")
		return join(homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
	if (process.platform === "win32")
		return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "obsidian", "obsidian.json");
	return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "obsidian", "obsidian.json");
}

export interface VaultEntry {
	name: string;
	path: string;
	open: boolean;
}

export function listVaults(): VaultEntry[] {
	try {
		const data = JSON.parse(readFileSync(registryPath(), "utf8")) as {
			vaults?: Record<string, { path: string; open?: boolean }>;
		};
		return Object.values(data.vaults ?? {})
			.map((v) => ({ name: basename(v.path), path: v.path, open: !!v.open }))
			.sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}
