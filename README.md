# tutorial-video — Claude Code skill

Narrated product tutorial videos, produced automatically: script → voice-over (ElevenLabs, OpenAI, Higgsfield, macOS say) → a real
recording (Playwright on a web app or an extension popup, or the iOS simulator) → ffmpeg with
cursor and tap highlights, captions, ducked music, title and end cards → 1080p mp4.

See [SKILL.md](SKILL.md) for the workflow, the three recording modes and the gotchas.

## Install

With the [Skills CLI](https://github.com/vercel-labs/skills) (works for Claude Code and other agents):

```bash
npx skills@latest add CarlosZiegler/tutorial-video-skill            # into the current project
npx skills@latest add CarlosZiegler/tutorial-video-skill --global   # for your user account
```

It is also part of the public collection [CarlosZiegler/zietec-skills](https://github.com/CarlosZiegler/zietec-skills) (`skills/video/tutorial-video`, generic templates):

```bash
npx skills@latest add CarlosZiegler/zietec-skills
```

Manual alternative: `git clone git@github.com:CarlosZiegler/tutorial-video-skill.git ~/.claude/skills/tutorial-video`.

Claude Code picks it up as the `tutorial-video` skill ("make a tutorial video of …").

## Requirements

- Node 22+, `ffmpeg` 8 (`brew install ffmpeg`), Python 3 with Pillow (masks, contact sheets, stills)
- Playwright in the project (`playwright` package) and its browsers: `npx playwright install chromium chromium-headless-shell`
- Voice: `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` (env, a `.env` above the tutorial folder, or keychain `elevenlabs-api-key` / `openai-api-key`); or clips generated elsewhere (e.g. the Higgsfield MCP) converted with `vo-from-files.mjs`; `VOICE=say` uses macOS voices for a free draft
- iOS mode: Xcode simulator + [argent](https://www.npmjs.com/package/@swmansion/argent) (`npx -y @swmansion/argent --help` once); macOS `avconvert` (built in) for the recordings

## Layout

- `scripts/` — generic: `voice.mjs`, `voice-samples.mjs`, `vo-from-files.mjs`, `render-frames.mjs`, `render-phone.mjs`, `overlay.js`, `driver.mjs`, `contact-sheet.py`, `find-label.py`, `pixelate-stills.py`
- `templates/` — starting points copied into a project's `tutorial/` folder and adapted: `script.example.json`, `record-web.mjs`, `record-stage.mjs` + `stage-popup.html` + `demo-mock.js`, `record-sim.mjs` + `stage-phone.html`. The web and stage templates come from a real project and show working scene actions; `record-sim.mjs` is a generic example. Replace the selectors, labels, routes and texts with the app's own.
