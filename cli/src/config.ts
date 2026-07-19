/* Persistent CLI config (a default vault) in an XDG config file. Zero deps. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONFIG_FILE = join(
	process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
	"fileclass",
	"config.json"
);

export interface Config {
	vault?: string;
}

export function readConfig(): Config {
	try {
		return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Config;
	} catch {
		return {};
	}
}

export function writeConfig(config: Config): void {
	mkdirSync(dirname(CONFIG_FILE), { recursive: true });
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}
