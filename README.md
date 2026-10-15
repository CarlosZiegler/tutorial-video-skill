# tutorial-video — Claude Code skill

Narrated product tutorial videos, produced automatically: script → OpenAI voice-over → a real
recording (Playwright on a web app or an extension popup, or the iOS simulator) → ffmpeg with
cursor and tap highlights, captions, ducked music, title and end cards → 1080p mp4.

See [SKILL.md](SKILL.md) for the workflow, the three recording modes and the gotchas.

## Install

```bash
git clone git@github.com:CarlosZiegler/tutorial-video-skill.git ~/.claude/skills/tutorial-video
```

Claude Code picks it up as the `tutorial-video` skill ("make a tutorial video of …").

## Requirements

- Node 22+, `ffmpeg` 8 (`brew install ffmpeg`), Python 3 with Pillow (masks, contact sheets)
- Playwright in the project (`playwright` package) and its browsers: `npx playwright install chromium chromium-headless-shell`
- Voice: `OPENAI_API_KEY` (env, a `.env` above the tutorial folder, or keychain `openai-api-key`); `VOICE=say` uses macOS voices for a free draft
- iOS mode: Xcode simulator + [argent](https://www.npmjs.com/package/@swmansion/argent) (`npx -y @swmansion/argent --help` once)

## Layout

- `scripts/` — generic: `voice.mjs`, `render-frames.mjs`, `render-phone.mjs`, `overlay.js`, `driver.mjs`
- `templates/` — starting points copied into a project's `tutorial/` folder and adapted: `script.example.json`, `record-web.mjs`, `record-stage.mjs` + `stage-popup.html` + `demo-mock.js`, `record-sim.mjs` + `stage-phone.html`. They come from a real project (PMC) and show working scene actions; replace the selectors, routes and texts with the app's own.
