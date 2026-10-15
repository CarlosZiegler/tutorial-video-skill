// Records the portal tutorial in a signed-in browser (run as a command of the session driver:
// default export receives { page, slug, log }). Real clicks on the test account; the overlay
// (overlay.js) adds cursor, captions and cards. Writes out/de/frames/*.jpg + out/de/timeline.json
// for ../../pmc-extension/tutorial/render.mjs.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PMC = "http://localhost:3000";

export default async ({ page, slug, log }) => {
	const lang = "de";
	const script = JSON.parse(readFileSync(join(HERE, `script.${lang}.json`), "utf8"));
	const vo = JSON.parse(readFileSync(join(HERE, "out", lang, "vo.json"), "utf8"));
	const out = join(HERE, "out", lang);
	const framesDir = join(out, "frames");
	rmSync(framesDir, { recursive: true, force: true });
	mkdirSync(framesDir, { recursive: true });

	// The logo as inline SVG markup: an <img> (path or data: URI) does not show inside the portal.
	const logoSvg = readFileSync(join(HERE, "../public/assets/logo/pmc/svg/pmc_white.svg"), "utf8")
		.replace(/<\?xml[^>]*>/, "")
		.replace("<svg ", '<svg style="height:54px;width:auto" ')
		.replaceAll("`", "")
		.replace(/\s+/g, " ");
	const overlay = readFileSync(join(HERE, "overlay.js"), "utf8").replaceAll(
		'<img src="/assets/logo/pmc/svg/pmc_white.svg" alt="">',
		logoSvg,
	);
	await page.addInitScript(overlay);
	await page.evaluate(() => sessionStorage.removeItem("tut"));
	await page.goto(`${PMC}/${slug}`, { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(4500);
	await page.evaluate(overlay);

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const stage = (fn, ...args) => page.evaluate(([name, a]) => window.__stage?.[name](...a), [fn, args]);
	/** After a navigation: the overlay is back and the page's own content (`ready`) is on screen. */
	const settle = async (ready) => {
		await page.waitForLoadState("domcontentloaded");
		await page.waitForFunction(() => Boolean(window.__stage), null, { timeout: 30000 });
		if (ready) await ready.waitFor({ state: "visible", timeout: 30000 });
		await sleep(900);
	};
	const boxOf = async (locator) => {
		await locator.scrollIntoViewIfNeeded().catch(() => {});
		await sleep(250);
		return locator.boundingBox();
	};
	const clickOn = async (locator, move = 750) => {
		const box = await boxOf(locator);
		if (!box) throw new Error("no box");
		await stage("move", box.x + Math.min(box.width / 2, 120), box.y + box.height / 2, move);
		await sleep(move + 120);
		await stage("click");
		await locator.click();
	};
	// A highlight is decoration: it never holds a scene up.
	const ringOn = async (locator) => {
		try {
			await locator.first().scrollIntoViewIfNeeded({ timeout: 3000 });
			await stage("ring", await locator.first().boundingBox({ timeout: 3000 }));
		} catch {
			// no ring then
		}
	};
	const ringOff = () => stage("ring", null);
	// The sidebar exists twice (desktop and the hidden mobile sheet): the visible one, by target.
	const nav = (hrefEnd) => page.locator(`a[href*="${hrefEnd}"]:visible`).first();

	const frames = [];
	const cdp = await page.context().newCDPSession(page);
	cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
		const file = join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);
		frames.push({ file, t: metadata.timestamp });
		writeFileSync(file, Buffer.from(data, "base64"));
		await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
	});
	await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

	const ACTIONS = {
		intro: async (at, d) => {
			await stage("title", script.title, script.subtitle, true);
			await at(d - 700);
			await stage("title", script.title, script.subtitle, false);
		},
		dashboard: async (at) => {
			const card = page.getByText(/Stundenzettel KW \d+ bestätigen/).first();
			await card.waitFor({ timeout: 20000 }).catch(() => {});
			await at(900);
			await ringOn(card.locator("xpath=ancestor::div[contains(@class,'rounded')][1]"));
			await stage("move", 900, 520, 900);
			await at(6200);
			await ringOff();
		},
		clockin: async (at) => {
			await clickOn(nav("/absence-time/my-times"));
			await settle(page.getByRole("button", { name: /Arbeit erneut starten|Einstempeln|Arbeit starten|Arbeitstag starten/ }).first());
			await ringOn(page.getByText("STECHUHR", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]"));
			await at(3600);
			await ringOff();
			await clickOn(page.getByRole("button", { name: /Arbeit erneut starten|Einstempeln|Arbeit starten|Arbeitstag starten/ }).first());
		},
		break: async (at) => {
			await clickOn(page.getByRole("button", { name: "Pause starten" }).first(), 600);
			await at(3400);
			await clickOn(page.getByRole("button", { name: /Pause beenden|Weiterarbeiten|Arbeit fortsetzen/ }).first(), 600);
		},
		open: async (at) => {
			const heading = page.getByText("Offene Arbeitstage", { exact: true }).first();
			await heading.scrollIntoViewIfNeeded();
			await page.mouse.wheel(0, 260);
			await sleep(600);
			// The first enabled row (older weeks are locked); one day keeps the dialog short.
			await clickOn(page.locator('button[role="checkbox"]:not([disabled])').first(), 700);
			await at(3800);
			await clickOn(page.getByRole("button", { name: /Ausgewählte bestätigen \(\d+\)/ }), 700);
			const dialog = page.getByRole("dialog").first();
			await dialog.waitFor();
			await sleep(1600);
			const finalButton = dialog.getByRole("button", { name: /^(Trotzdem )?[Bb]estätigen$/ }).last();
			for (let step = 0; step < 3 && !(await finalButton.count()); step++) {
				await clickOn(dialog.getByRole("button", { name: "Weiter" }), 600);
				await sleep(900);
			}
			if (!(await finalButton.isEnabled())) {
				// A day without stamps: begin and end from the model, the break typed in.
				for (const chip of [/Beginn aus dem Arbeitszeitmodell/, /Ende aus dem Arbeitszeitmodell/]) {
					const b = dialog.getByRole("button", { name: chip });
					if (await b.count()) await clickOn(b, 450);
				}
				const inputs = dialog.locator('input[type="text"]');
				for (const [index, value] of [[2, "12:00"], [3, "12:30"]]) {
					if ((await inputs.count()) <= index) break;
					await clickOn(inputs.nth(index), 450);
					await inputs.nth(index).fill("");
					await inputs.nth(index).pressSequentially(value, { delay: 90 });
					await inputs.nth(index).press("Tab");
				}
				await sleep(500);
			}
			await at(8200);
			await clickOn(finalButton, 600);
			await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
		},
		timesheet: async (at) => {
			await page.evaluate(() => window.scrollTo({ top: 0 }));
			await clickOn(nav("timesheet?ansicht=self"));
			await settle(page.getByText("Differenz", { exact: true }).first());
			await at(2600);
			await ringOn(page.getByText("Differenz", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'grid')][1]"));
			await at(7200);
			await ringOff();
		},
		woche: async (at) => {
			if (!(await nav("/absence-time/woche").count())) {
				await clickOn(page.getByRole("button", { name: "Arbeitszeit", exact: true }).first(), 600);
				await sleep(500);
			}
			await clickOn(nav("/absence-time/woche"));
			await settle(page.getByRole("button", { name: /Woche bestätigen \(\d+\)/ }));
			await at(2400);
			await ringOn(page.getByRole("button", { name: /Woche bestätigen \(\d+\)/ }));
			await at(5000);
			await ringOff();
			const row = page.getByRole("button", { name: "Bestätigen", exact: true }).first();
			if (await row.count()) await clickOn(row, 700);
		},
		outro: async () => {
			await stage("move", 2400, 1400, 400);
			await stage("caption", "");
			await stage("end", true);
		},
	};

	// Fail fast inside the recording: a missing element must not freeze the video for 30 s.
	page.setDefaultTimeout(9000);
	await stage("sync", true);
	await sleep(300);
	await stage("sync", false);
	await sleep(300);

	const timeline = { frames: [], scenes: [] };
	for (const scene of script.scenes) {
		const duration = Math.round(vo.scenes[scene.id].duration * 1000);
		const start = Date.now();
		await stage("chapter", scene.chapter);
		await stage("caption", scene.id === "intro" || scene.id === "outro" ? "" : scene.vo);
		const at = async (ms) => {
			const wait = start + ms - Date.now();
			if (wait > 0) await sleep(wait);
		};
		try {
			await ACTIONS[scene.id](at, duration);
		} catch (e) {
			log(`  scene ${scene.id}: ${String(e.message).split("\n")[0]}`);
		}
		await at(duration + 600);
		timeline.scenes.push({ id: scene.id, start: start / 1000, end: Date.now() / 1000, voStart: start / 1000 + 0.25 });
		log(`  ${scene.id}: ${((Date.now() - start) / 1000).toFixed(2)} s`);
	}
	await sleep(2200);
	await cdp.send("Page.stopScreencast");
	await sleep(300);
	page.setDefaultTimeout(30000);
	timeline.frames = frames;
	timeline.end = Date.now() / 1000;
	writeFileSync(join(out, "timeline.json"), JSON.stringify(timeline));
	log(`  ${frames.length} frames`);
};
