# Jarvis Voice Agent

Jarvis is a local-first voice assistant that sends spoken requests to the signed-in Codex account and reads replies aloud. It combines the Codex voice bridge, local Whisper speech recognition, Fish Audio or local Kokoro speech, a persistent Codex conversation, a local memory vault, and an optional Barehands gesture board.

## Quick start (Windows)

1. Install Node.js 22 or newer, Python (for the runtime installer), and the Codex CLI. Sign in with `codex login` and confirm `codex login status`.
2. Clone this repo and open a terminal in its folder.
3. Run `Install Local Voice.cmd` once. This creates an isolated Python 3.12 runtime; speech models download on first use.
4. Copy `.env.example` to `.env`. Fish Audio is optional; without a Fish key, Jarvis can use local Kokoro speech.
5. Run `Talk to Jarvis.cmd` and open `http://127.0.0.1:4320/faces/board/`.
6. Say **“Hey Jarvis, what is two plus two?”** or hold **Home** to talk directly.

On first use, Jarvis creates a persistent Codex conversation and saves its ID under `.data/`. To use an existing conversation, set `JARVIS_CODEX_THREAD_ID` in the local `.env` before starting. That value is private and must never be committed.

## Optional gesture board

Say **“Hey Jarvis, gesture mode on”** to open the local gesture board in a new browser tab. Allow camera access when the browser asks. You can also run `Jarvis Barehands.cmd` directly. The main voice interface works without the gesture board.

## What is connected

- **Brain:** the authenticated Codex App Server session. Jarvis selects a model advertised to the signed-in account; no separate model API key is required.
- **Speech input:** local Whisper small.en with wake-word detection and push-to-talk.
- **Speech output:** Fish Audio when configured; local Kokoro is available as an alternative.
- **Memory:** local Markdown files under `.data/vault/`.
- **Actions:** tools available to the signed-in Codex session may be used under the platform’s normal permissions and per-action approval flow. Gmail and Calendar depend on the user’s Codex connections. Browser/desktop access depends on available tools and permissions.

The wake-word mode keeps the microphone open for local speech detection; ordinary speech is discarded until the wake phrase is heard. For a lower-mic-use session, switch to push-to-talk and hold **Home**.

## Privacy and safety

The local server binds to `127.0.0.1`. API keys belong in the local `.env`; memory, Codex chat IDs, model downloads, and runtime files stay in ignored local folders. Never paste credentials into an LLM chat or commit them. Jarvis does not enable blanket auto-approval. Platform permissions and individual action approvals remain in force.

Voice interaction requires a working microphone and speakers. Browser/camera behavior and desktop integrations vary by machine and account; verify those locally. Do not treat the app as successful until you hear a spoken reply from your own microphone test.

## Development

```powershell
npm test
node --check server.mjs
```

See [`CLONE_AND_START.md`](CLONE_AND_START.md) for instructions an LLM coding agent can follow after cloning, and [`AGENTS.md`](AGENTS.md) for repository-specific safety guidance.

## Sources and license

Jarvis combines and adapts the repositories named in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). The project and adapted components are distributed under AGPL-3.0-or-later. Preserve upstream notices when modifying or redistributing.
