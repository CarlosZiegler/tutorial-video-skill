// Records the tutorial: the real popup build (with demo-mock.js) on stage.html, driven by
// Playwright, captured through the Chrome screencast with timestamps. Each scene holds for its
// narration (out/<lang>/vo.json). Writes out/<lang>/frames/*.jpg and out/<lang>/timeline.json.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2] ?? "de";
const require = createRequire(join(here, "../../pmc/package.json"));
const { chromium } = require("playwright");
// The headless shell: its screencast covers the whole 1920×1080 viewport (full Chrome's new
// headless mode cuts the frame to 993 px).
const CHROME = process.env.TUTORIAL_CHROME ??
	`${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const script = JSON.parse(readFileSync(join(here, `script.${lang}.json`), "utf8"));
const vo = JSON.parse(readFileSync(join(here, "out", lang, "vo.json"), "utf8"));
const out = join(here, "out", lang);
const site = join(here, "out", "site");
const framesDir = join(out, "frames");

// The site: the extension build + the stage + the demo page that loads the popup with the mocks.
rmSync(site, { recursive: true, force: true });
cpSync(join(here, "../.output/chrome-mv3"), site, { recursive: true });
mkdirSync(join(site, "stage"), { recursive: true });
for (const f of ["pmc_gray.svg", "pmc_white.svg"]) {
	cpSync(join(here, "../../pmc/public/assets/logo/pmc/svg", f), join(site, "stage", f));
}
cpSync(join(here, "stage.html"), join(site, "stage.html"));
cpSync(join(here, "demo-mock.js"), join(site, "demo-mock.js"));
const chunk = readdirSync(join(site, "chunks")).find((f) => f.startsWith("popup-"));
const css = readdirSync(join(site, "assets")).find((f) => f.startsWith("popup-"));
writeFileSync(
	join(site, "demo.html"),
	`<!doctype html><html lang="de"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/${css}"><style>html{zoom:1.3}.demo-ring{outline:3px solid #dd083b!important;outline-offset:4px;box-shadow:0 0 0 9px rgba(221,8,59,.14)!important;transition:outline-color .3s}</style><script src="/demo-mock.js"></script></head><body><div id="root"></div><script type="module" src="/chunks/${chunk}"></script></body></html>`,
);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
	try {
		const body = readFileSync(join(site, path === "/" ? "stage.html" : path));
		res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404).end();
	}
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, screen: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${base}/stage.html`);
await page.frameLocator("#popupFrame").getByRole("button", { name: "Im Portal anmelden" }).waitFor();

const frames = [];
const cdp = await page.context().newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
	const file = join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);
	frames.push({ file, t: metadata.timestamp });
	writeFileSync(file, Buffer.from(data, "base64"));
	await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stage = (fn, ...args) => page.evaluate(([name, a]) => window.__stage[name](...a), [fn, args]);
const popup = page.frameLocator("#popupFrame");
const demo = (fn, ...args) =>
	page.evaluate(([name, a]) => document.getElementById("popupFrame").contentWindow.__demo[name](...a), [fn, args]);

/** Moves the cursor onto a locator (popup or stage), then clicks it with a ripple. */
const clickOn = async (locator, { move = 750, click = true } = {}) => {
	const box = await locator.boundingBox();
	if (!box) throw new Error("no box");
	await stage("move", box.x + box.width / 2, box.y + box.height / 2, move);
	await sleep(move + 120);
	if (!click) return;
	await stage("click");
	await locator.click();
};
/** Highlights an element: inside the popup an outline on it, on the stage a ring around it. */
const ringOn = async (locator) => {
	if (locator === ext) {
		await stage("ring", await locator.boundingBox());
		return;
	}
	await locator.evaluate((el) => el.classList.add("demo-ring"));
};
const ringOff = async () => {
	await stage("ring", null);
	await page.frameLocator("#popupFrame").locator(".demo-ring").evaluateAll((els) => {
		for (const el of els) el.classList.remove("demo-ring");
	});
};
const ext = page.locator("#ext");

/** Scene actions; `at(ms)` waits until that offset into the scene. */
const ACTIONS = {
	intro: async (at, d) => {
		await stage("title", script.title, script.subtitle, true);
		await at(d - 700);
		await stage("title", script.title, script.subtitle, false);
	},
	install: async (at, d) => {
		await stage("overlay", "install", true);
		await at(600);
		await stage("step", 1);
		await at(d * 0.38);
		await stage("step", 2);
		await at(d * 0.66);
		await stage("step", 3);
		await at(d - 500);
		await stage("overlay", "install", false);
	},
	connect: async (at) => {
		await clickOn(ext);
		await stage("popup", true);
		await at(1900);
		await clickOn(popup.getByRole("button", { name: "Im Portal anmelden" }));
		await sleep(500);
		await stage("popup", false);
		await stage("page", "connect");
		await at(6200);
		await clickOn(page.locator("#verbinden"));
		await stage("connected");
		await demo("connected");
		await at(9000);
		await stage("page", "portal");
		await clickOn(ext);
		await stage("popup", true);
	},
	clockin: async (at) => {
		// The demo day starts at 08:02 sharp, whatever the scenes before took.
		await demo("setNow", "2026-10-15T06:01:58.000Z");
		const button = popup.getByRole("button", { name: "Einstempeln" });
		await button.waitFor();
		await ringOn(button);
		await at(1300);
		await ringOff();
		await clickOn(button);
		await at(4600);
		await ringOn(ext);
		await at(7400);
		await ringOff();
	},
	notice: async (at, d) => {
		// 5:46 h after the clock-in: the § 4 ArbZG notice is due.
		await demo("setNow", "2026-10-15T11:48:20.000Z");
		await at(900);
		await stage("notify", "Pause fällig", "Sie arbeiten seit fast 6 Stunden ohne Pause.");
		await at(2600);
		await ringOn(popup.locator(".hint").first());
		await at(d - 400);
		await ringOff();
		await stage("unnotify");
	},
	break: async (at) => {
		await clickOn(popup.getByRole("button", { name: "Pause starten" }), { move: 600 });
		await at(2500);
		await demo("setNow", "2026-10-15T12:18:30.000Z");
		await at(3000);
		await clickOn(popup.getByRole("button", { name: "Pause beenden" }), { move: 500 });
	},
	clockout: async (at) => {
		await demo("setNow", "2026-10-15T14:41:10.000Z");
		await at(400);
		await clickOn(popup.getByRole("button", { name: "Ausstempeln" }), { move: 600 });
		await at(3300);
		await clickOn(popup.getByRole("button", { name: "Bestätigen" }), { move: 600 });
	},
	open: async (at) => {
		await clickOn(popup.getByRole("button", { name: /Offen/ }), { move: 600 });
		await at(2200);
		await ringOn(popup.locator(".open"));
		await at(4600);
		await ringOff();
		await clickOn(popup.getByRole("button", { name: "Bestätigen" }).first(), { move: 600 });
		await at(7400);
		await ringOn(popup.getByRole("link", { name: /Zeiten eintragen/ }));
		await at(9600);
		await ringOff();
	},
	security: async (at, d) => {
		await stage("move", 960, 1200, 600);
		await stage("popup", false);
		await stage("overlay", "security", true);
		await at(d - 400);
		await stage("overlay", "security", false);
	},
	outro: async () => {
		await stage("end", true);
	},
};

// Sync marker: one magenta flash at the start (also the first frame's anchor).
await stage("sync", true);
await sleep(300);
await stage("sync", false);
await sleep(300);

const timeline = { frames: [], scenes: [] };
for (const scene of script.scenes) {
	const duration = Math.round(vo.scenes[scene.id].duration * 1000);
	const hold = duration + 600;
	const start = Date.now();
	await stage("chapter", scene.chapter);
	await stage("caption", scene.id === "intro" || scene.id === "outro" ? "" : scene.vo);
	const at = async (ms) => {
		const wait = start + ms - Date.now();
		if (wait > 0) await sleep(wait);
	};
	await ACTIONS[scene.id](at, duration);
	await at(hold);
	timeline.scenes.push({ id: scene.id, start: start / 1000, end: Date.now() / 1000, voStart: start / 1000 + 0.25 });
	console.log(`${scene.id}: ${((Date.now() - start) / 1000).toFixed(2)} s`);
}
await stage("caption", "");
await sleep(2200);
await cdp.send("Page.stopScreencast");
await sleep(300);
timeline.frames = frames.map((f) => ({ file: f.file, t: f.t }));
timeline.end = Date.now() / 1000;
writeFileSync(join(out, "timeline.json"), JSON.stringify(timeline));
await browser.close();
server.close();
console.log(`${frames.length} frames`);
