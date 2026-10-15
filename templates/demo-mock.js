// The popup's world for the tutorial: chrome.* and the PMC's extension.* answered in the page,
// with a clock the recorder can move (window.__demo). Example data only, no server.
(() => {
	const MIN = 60000;
	let anchorDemo = Date.parse("2026-10-15T06:02:00.000Z"); // 08:02 in Berlin
	let anchorReal = performance.now();
	const realNow = Date.now.bind(Date);
	const demoNow = () => anchorDemo + (performance.now() - anchorReal);
	Date.now = () => Math.floor(demoNow());

	const world = {
		zustand: "NICHT_GESTARTET",
		blocks: [],
		tagStatus: "ENTWURF",
		signedIn: false,
		open: [
			{ datum: "2026-10-09", dauerMinuten: 495, pauseMinuten: 45, dringlich: true, erfassung: "STECHUHR", bestaetigbar: true, fingerabdruck: "d".repeat(64), hinweise: [] },
			{ datum: "2026-10-12", dauerMinuten: 480, pauseMinuten: 30, dringlich: false, erfassung: "EINGABE", bestaetigbar: true, fingerabdruck: "c".repeat(64), hinweise: [] },
			{ datum: "2026-10-13", dauerMinuten: 472, pauseMinuten: 30, dringlich: false, erfassung: "STECHUHR", bestaetigbar: true, fingerabdruck: "b".repeat(64), hinweise: [] },
		],
		listeners: [],
	};
	const iso = (ms) => new Date(ms).toISOString();
	const closedMinutes = (typ) =>
		world.blocks
			.filter((b) => b.typ === typ && b.ende)
			.reduce((sum, b) => sum + Math.round((Date.parse(b.ende) - Date.parse(b.beginn)) / MIN), 0);
	const state = () => {
		const open = world.blocks.find((b) => !b.ende);
		const ended = world.zustand === "BEENDET";
		return {
			beschaeftigung: "b1",
			datum: "2026-10-15",
			zustand: world.zustand,
			seit: open ? open.beginn : null,
			serverZeit: iso(demoNow()),
			arbeitMinutenHeute: closedMinutes("ARBEIT"),
			pauseMinutenHeute: closedMinutes("PAUSE"),
			letzteBloecke: world.blocks.map((b) => ({ ...b, quelle: "STEMPEL" })),
			tagStatus: world.tagStatus,
			autoBeendet: null,
			zusammenfassung: ended
				? {
						beginn: world.blocks[0].beginn,
						ende: world.blocks.at(-1).ende,
						pauseMinuten: closedMinutes("PAUSE"),
						arbeitMinuten: closedMinutes("ARBEIT"),
						fingerabdruck: "a".repeat(64),
						hinweise: [],
					}
				: null,
		};
	};
	const act = (action) => {
		const now = iso(demoNow());
		const open = world.blocks.find((b) => !b.ende);
		if (open) open.ende = now;
		if (action === "clockIn" || action === "breakEnd") world.blocks.push({ typ: "ARBEIT", beginn: now, ende: null });
		if (action === "breakStart") world.blocks.push({ typ: "PAUSE", beginn: now, ende: null });
		world.zustand = { clockIn: "ARBEIT", breakEnd: "ARBEIT", breakStart: "PAUSE", clockOut: "BEENDET" }[action];
		if (action === "clockIn" || action === "clockOut") world.tagStatus = "ERFASST";
		return state();
	};

	const store = { session: {}, local: {} };
	const area = (name) => ({
		get: async (keys) => {
			const out = {};
			for (const k of [].concat(keys ?? Object.keys(store[name]))) if (k in store[name]) out[k] = store[name][k];
			return out;
		},
		set: async (items) => Object.assign(store[name], items),
		remove: async (keys) => {
			for (const k of [].concat(keys)) delete store[name][k];
		},
		onChanged: { addListener() {}, removeListener() {} },
		setAccessLevel: async () => {},
	});
	const ev = { addListener() {}, removeListener() {}, hasListener: () => false };
	globalThis.chrome = {
		runtime: {
			id: "demo",
			getManifest: () => ({ version: "0.1.0", manifest_version: 3 }),
			getURL: (p) => p,
			onMessage: ev,
			sendMessage: async (message) => {
				if (message.type === "connect") {
					// The stage plays the portal; it resolves once "Verbinden" was clicked.
					await new Promise((resolve) => world.listeners.push(resolve));
					store.session.pmcSession = { token: "demo", expiresAt: iso(realNow() + 7 * 86400000) };
					world.signedIn = true;
				}
				if (message.type === "signOut") store.session = {};
				return { ok: true };
			},
		},
		commands: { getAll: async () => [{ name: "_execute_action", shortcut: "Alt+Shift+S" }] },
		storage: { session: area("session"), local: area("local"), sync: area("local"), managed: area("local"), onChanged: ev },
	};
	globalThis.browser = globalThis.chrome;
	Object.defineProperty(navigator, "language", { get: () => "de-DE" });

	const answer = (data) =>
		new Response(JSON.stringify({ result: { data: { json: data } } }), { headers: { "content-type": "application/json" } });
	window.fetch = async (url, init) => {
		const path = new URL(url).pathname.replace("/api/trpc/", "");
		const input = init?.body ? JSON.parse(init.body).json : {};
		await new Promise((r) => setTimeout(r, 260)); // a real round trip, so the spinner shows
		if (path === "extension.me")
			return answer({ name: "Erika Muster", mandant: "Pflegedienst Nord GmbH", mandantSlug: "a123456", locale: "de", sessionExpiresAt: "2026-10-22T06:00:00.000Z", pmcHr: true, employments: [{ beschaeftigung: "b1", personalnummer: "1001", taetigkeit: "Pflegefachkraft", primaer: true }] });
		if (path === "extension.clock.state") return answer(state());
		if (path.startsWith("extension.clock.")) return answer(act(path.split(".").at(-1)));
		if (path === "extension.days.open") return answer({ beschaeftigung: "b1", heute: "2026-10-15", tage: world.open });
		if (path === "extension.day.confirm") {
			if (input.art === "FEIERABEND") world.tagStatus = "MA_BESTAETIGT";
			else world.open = world.open.filter((d) => d.datum !== input.datum);
			return answer({ bestaetigt: [input.datum], uebersprungen: [], nachtraeglich: [], ohneArbeit: [] });
		}
		return answer(null);
	};

	window.__demo = {
		/** Move the demo clock to an instant (ISO); the popup's timer continues from there. */
		setNow: (isoTime) => {
			anchorDemo = Date.parse(isoTime);
			anchorReal = performance.now();
		},
		connected: () => {
			for (const resolve of world.listeners.splice(0)) resolve();
		},
		world,
	};
})();
