/*
 * Minimal YouTube Data API v3 client: OAuth loopback flow, resumable video
 * upload, caption track, playlist. Plain `fetch` + `node:http` — no googleapis
 * dependency, because this needs three endpoints, not a 100 MB SDK.
 *
 * One-time setup is in ../PUBLISHING.md. Credentials live outside the repo:
 *   ~/.config/fileclass-demo/client_secret.json   (from Google Cloud, Desktop app)
 *   ~/.config/fileclass-demo/tokens.json          (written by `publish.mjs --auth`)
 *   ~/.config/fileclass-demo/config.json          (playlist title, category, …)
 *
 * NOTE on visibility: YouTube locks uploads from an API project that hasn't
 * passed the compliance audit to `private`, whatever `privacyStatus` asks for.
 * The upload therefore reports the status the API actually returned rather than
 * the one requested — see PUBLISHING.md.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = process.env.FILECLASS_DEMO_CONFIG || join(homedir(), ".config", "fileclass-demo");
const CLIENT_FILE = join(CONFIG_DIR, "client_secret.json");
const TOKENS_FILE = join(CONFIG_DIR, "tokens.json");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/** upload = videos.insert; force-ssl = captions + playlists. */
const SCOPES = [
	"https://www.googleapis.com/auth/youtube.upload",
	"https://www.googleapis.com/auth/youtube.force-ssl",
];

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

export const paths = { CONFIG_DIR, CLIENT_FILE, TOKENS_FILE, CONFIG_FILE };

/** Publishing defaults, overridable in config.json. */
export function config() {
	const stored = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
	return {
		playlistTitle: "Fileclass for Obsidian",
		playlistId: "",
		categoryId: "28", // Science & Technology
		privacyStatus: "public",
		language: "en",
		...stored,
	};
}

function clientCredentials() {
	if (!existsSync(CLIENT_FILE)) {
		throw new Error(
			`No OAuth client at ${CLIENT_FILE}.\nFollow demo/PUBLISHING.md — it takes about five minutes, once.`
		);
	}
	const raw = JSON.parse(readFileSync(CLIENT_FILE, "utf8"));
	const c = raw.installed ?? raw.web ?? raw;
	if (!c.client_id || !c.client_secret) throw new Error(`${CLIENT_FILE} has no client_id/secret.`);
	return { id: c.client_id, secret: c.client_secret };
}

async function tokenRequest(body) {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body),
	});
	const json = await res.json();
	if (!res.ok) throw new Error(`OAuth failed: ${json.error_description ?? json.error ?? res.status}`);
	return json;
}

/**
 * Interactive consent, once: opens the browser, catches the redirect on a
 * loopback port, stores the refresh token. `prompt=consent` + `access_type=
 * offline` are what make Google hand one out.
 */
export async function authorize() {
	const client = clientCredentials();
	const { server, port, code } = await loopbackServer();
	const redirect = `http://127.0.0.1:${port}`;
	const url =
		"https://accounts.google.com/o/oauth2/v2/auth?" +
		new URLSearchParams({
			client_id: client.id,
			redirect_uri: redirect,
			response_type: "code",
			scope: SCOPES.join(" "),
			access_type: "offline",
			prompt: "consent",
		});
	console.log(`Opening the consent screen…\nIf nothing opens, visit:\n${url}\n`);
	spawn("open", [url], { stdio: "ignore", detached: true }).unref();

	const received = await code;
	server.close();
	const tokens = await tokenRequest({
		client_id: client.id,
		client_secret: client.secret,
		code: received,
		grant_type: "authorization_code",
		redirect_uri: redirect,
	});
	if (!tokens.refresh_token) {
		throw new Error("Google returned no refresh token — revoke the app's access and retry.");
	}
	mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(TOKENS_FILE, JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2));
	return TOKENS_FILE;
}

/** Waits for Google's redirect and answers the browser with a plain page. */
function loopbackServer() {
	return new Promise((resolveServer) => {
		let settle;
		const code = new Promise((r, reject) => {
			settle = { r, reject };
		});
		const server = createServer((req, res) => {
			const url = new URL(req.url, "http://127.0.0.1");
			const got = url.searchParams.get("code");
			const err = url.searchParams.get("error");
			res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
			res.end(got ? "Authorized. You can close this tab." : `Authorization failed: ${err}`);
			if (got) settle.r(got);
			else settle.reject(new Error(`Authorization denied (${err})`));
		});
		server.listen(0, "127.0.0.1", () => resolveServer({ server, port: server.address().port, code }));
	});
}

export async function accessToken() {
	if (!existsSync(TOKENS_FILE)) {
		throw new Error(`Not authorized yet — run \`node publish.mjs --auth\` first.`);
	}
	const client = clientCredentials();
	const { refresh_token } = JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
	const tokens = await tokenRequest({
		client_id: client.id,
		client_secret: client.secret,
		refresh_token,
		grant_type: "refresh_token",
	});
	return tokens.access_token;
}

async function api(token, path, { method = "GET", body, params } = {}) {
	const url = `${API}/${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
	const res = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error ?? json)}`);
	return json;
}

/**
 * Sends the file bytes with `node:https` rather than `fetch`.
 *
 * `fetch` (undici) streaming a multi-megabyte body has a habit of losing the
 * response — you get a bare "fetch failed" at 100%, with the real cause buried
 * and no status code to act on. A plain https request gives us the status, the
 * body and proper error events, which is what a resumable upload needs.
 */
function putBytes(uploadUrl, { token, file, size, offset = 0, contentType = "video/mp4", onProgress }) {
	return new Promise((resolveResponse, reject) => {
		const url = new URL(uploadUrl);
		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": contentType,
			"Content-Length": String(size - offset),
		};
		if (offset > 0) headers["Content-Range"] = `bytes ${offset}-${size - 1}/${size}`;

		const req = httpsRequest(
			{ method: "PUT", hostname: url.hostname, path: `${url.pathname}${url.search}`, headers },
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (c) => (body += c));
				res.on("end", () => resolveResponse({ status: res.statusCode, headers: res.headers, body }));
			}
		);
		req.on("error", reject);

		let sent = offset;
		const stream = createReadStream(file, offset ? { start: offset } : {});
		stream.on("data", (chunk) => {
			sent += chunk.length;
			onProgress?.(sent, size);
		});
		stream.on("error", reject);
		stream.pipe(req);
	});
}

/**
 * Asks the session how many bytes it already holds — the one call that turns a
 * dropped connection into a resume instead of a re-upload. 308 means incomplete
 * (the `range` header says how far it got); 200/201 means the video is in fact
 * already created.
 */
export async function sessionStatus(uploadUrl, { token, size }) {
	const url = new URL(uploadUrl);
	const res = await new Promise((resolveResponse, reject) => {
		const req = httpsRequest(
			{
				method: "PUT",
				hostname: url.hostname,
				path: `${url.pathname}${url.search}`,
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Length": "0",
					"Content-Range": `bytes */${size}`,
				},
			},
			(r) => {
				let body = "";
				r.setEncoding("utf8");
				r.on("data", (c) => (body += c));
				r.on("end", () => resolveResponse({ status: r.statusCode, headers: r.headers, body }));
			}
		);
		req.on("error", reject);
		req.end();
	});

	if (res.status === 200 || res.status === 201) {
		return { done: true, video: JSON.parse(res.body) };
	}
	if (res.status === 308) {
		const range = res.headers.range; // "bytes=0-12345", absent when nothing arrived
		const received = range ? Number(range.split("-").at(-1)) + 1 : 0;
		return { done: false, received };
	}
	throw new Error(`The upload session is gone (${res.status}) — start a fresh upload.`);
}

/**
 * Resumable upload: a JSON metadata request returns an upload URL, then the bytes
 * go up. `onSession` receives that URL before the transfer starts, so a caller can
 * persist it and resume later instead of pushing the whole file again.
 */
export async function uploadVideo(token, { file, snippet, status, onProgress, onSession }) {
	const size = statSync(file).size;
	const start = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json; charset=UTF-8",
			"X-Upload-Content-Length": String(size),
			"X-Upload-Content-Type": "video/mp4",
		},
		body: JSON.stringify({ snippet, status }),
	});
	if (!start.ok) {
		throw new Error(`videos.insert refused the session: ${start.status} ${await start.text()}`);
	}
	const uploadUrl = start.headers.get("location");
	if (!uploadUrl) throw new Error("No upload URL in the resumable session response.");
	onSession?.({ uploadUrl, size });

	return sendWithResume(uploadUrl, { token, file, size, onProgress });
}

/** Finishes an upload started earlier (a saved session URL). */
export async function resumeUpload(token, { uploadUrl, file, onProgress }) {
	const size = statSync(file).size;
	const state = await sessionStatus(uploadUrl, { token, size });
	if (state.done) return state.video;
	return sendWithResume(uploadUrl, { token, file, size, offset: state.received, onProgress });
}

/** One PUT, then one resume attempt if the connection dropped mid-flight. */
async function sendWithResume(uploadUrl, { token, file, size, offset = 0, onProgress }) {
	let res;
	try {
		res = await putBytes(uploadUrl, { token, file, size, offset, onProgress });
	} catch (err) {
		// Connection lost: ask the session where it stopped and send the rest.
		const state = await sessionStatus(uploadUrl, { token, size });
		if (state.done) return state.video;
		console.warn(`  connection dropped (${err.code ?? err.message}) — resuming at ${state.received} bytes`);
		res = await putBytes(uploadUrl, { token, file, size, offset: state.received, onProgress });
	}

	if (res.status === 200 || res.status === 201) return JSON.parse(res.body);
	if (res.status === 308) {
		const state = await sessionStatus(uploadUrl, { token, size });
		if (state.done) return state.video;
		throw new Error(`Upload incomplete: YouTube holds ${state.received} of ${size} bytes.`);
	}
	throw new Error(`Upload failed: ${res.status} ${res.body.slice(0, 400)}`);
}

/**
 * Everything worth knowing about a published video: whether YouTube actually got
 * a whole file, whether it finished processing, and which caption tracks it
 * serves. `uploadStatus: uploaded` with no `fileDetails` hours later means the
 * upload never completed — see PUBLISHING.md.
 */
export async function videoStatus(token, videoId) {
	const v = await api(token, "videos", {
		params: { part: "snippet,status,processingDetails,fileDetails", id: videoId },
	});
	const item = v.items?.[0];
	if (!item) throw new Error(`No such video (or not yours): ${videoId}`);
	const captions = await api(token, "captions", { params: { part: "snippet", videoId } });
	return {
		title: item.snippet?.title,
		privacyStatus: item.status?.privacyStatus,
		uploadStatus: item.status?.uploadStatus,
		failureReason: item.status?.failureReason ?? item.status?.rejectionReason ?? null,
		processingStatus: item.processingDetails?.processingStatus,
		durationMs: item.fileDetails?.durationMs ? Number(item.fileDetails.durationMs) : null,
		fileSize: item.fileDetails?.fileSize ? Number(item.fileDetails.fileSize) : null,
		captions: (captions.items ?? []).map((c) => ({
			language: c.snippet?.language,
			kind: c.snippet?.trackKind, // "standard" = ours, "asr" = YouTube's transcription
			name: c.snippet?.name,
			status: c.snippet?.status,
		})),
	};
}

/** The channel's latest uploads — to check whether a video did land after all. */
export async function recentUploads(token, count = 5) {
	const channel = await api(token, "channels", { params: { part: "contentDetails", mine: "true" } });
	const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
	if (!uploads) return [];
	const items = await api(token, "playlistItems", {
		params: { part: "snippet,status", playlistId: uploads, maxResults: String(count) },
	});
	return (items.items ?? []).map((i) => ({
		videoId: i.snippet?.resourceId?.videoId,
		title: i.snippet?.title,
		publishedAt: i.snippet?.publishedAt,
		privacyStatus: i.status?.privacyStatus,
	}));
}

/** Attaches an SRT track. Multipart is fine here — captions are a few kB. */
export async function insertCaptions(token, { videoId, file, language = "en", name = "English" }) {
	const boundary = `fc${Math.abs(videoId.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7))}`;
	const meta = JSON.stringify({ snippet: { videoId, language, name, isDraft: false } });
	const body = Buffer.concat([
		Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
		Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
		readFileSync(file),
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);
	const res = await fetch(`${UPLOAD}/captions?uploadType=multipart&part=snippet`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": `multipart/related; boundary=${boundary}`,
			"Content-Length": String(body.length),
		},
		body,
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`captions.insert → ${res.status} ${JSON.stringify(json.error ?? json)}`);
	return json;
}

/** The series playlist: the configured id, else found by title, else created. */
export async function ensurePlaylist(token, { playlistId, playlistTitle, language = "en" }) {
	if (playlistId) return playlistId;
	const mine = await api(token, "playlists", {
		params: { part: "snippet", mine: "true", maxResults: "50" },
	});
	const hit = mine.items?.find((p) => p.snippet?.title === playlistTitle);
	if (hit) return hit.id;
	const created = await api(token, "playlists", {
		method: "POST",
		params: { part: "snippet,status" },
		body: {
			snippet: { title: playlistTitle, description: "Fileclass, one feature per minute.", defaultLanguage: language },
			status: { privacyStatus: "public" },
		},
	});
	return created.id;
}

export async function addToPlaylist(token, { playlistId, videoId }) {
	return api(token, "playlistItems", {
		method: "POST",
		params: { part: "snippet" },
		body: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
	});
}

export const videoUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
export const playlistUrl = (id) => `https://www.youtube.com/playlist?list=${id}`;
