# Jarvis — Codex adaptation of fullstack-agent

The localhost root is Jarvis voice chat; the original circuit-board visualizer remains at `/faces/board/`. Its four face HTML files and shared visual core are byte-for-byte identical to the pinned upstream revision, with upstream licenses and attribution retained.

## Use it

Run **Talk to Jarvis.cmd** (or **Start Jarvis.cmd**). It starts the browser backend and opens **http://localhost:4320/**. Click the orb once and allow microphone access. After that, Jarvis starts wake listening on later opens: say **“Hey Jarvis”** and your request; or say **“Hey Jarvis”**, hear **“Yes?”**, then give your request within eight seconds. Click the orb again to turn wake listening off. Replies stream into the visible chat panel; fast browser speech is the default and Fish Audio is optional. Browser wake-word recognition uses the browser speech service; it is not local Whisper. The separate native mode (`launch-stack.ps1 voice`) uses local Whisper and should not be run at the same time as browser wake listening.

**Space** runs the original cinematic flythrough. **F** toggles fullscreen. The original sound control enables the thinking sound after browser audio permission. Other original faces are at `/faces/radial/`, `/faces/rain/`, `/faces/neural/`; `/gallery` is the original gallery.

**Jarvis Barehands.cmd** opens the original gesture board at **http://127.0.0.1:8794/stage.html**. Use Chrome for camera access. The board retains the original notes, image, 3D, pinch/drag/scale/clap/claw gestures and OBS render mode. MediaPipe, its hand model, and three.js are cached locally. Camera permission is still required. The in-app browser did not finish camera startup during verification, so real gestures are not claimed as tested.

## What is connected

- **Brain:** existing ChatGPT sign-in through Codex app-server. No extra AI API key. One persistent destination is saved privately for this installation. Do not commit its thread ID. Desktop live history refresh remains unverified; the bridge refuses a resume when saved history reports a running turn.
- **Browser input:** Web Speech Recognition provides continuous wake-word listening after the user enables microphone access. It recognizes “Hey Jarvis” in the browser speech service, then sends the request text to the Codex bridge. The separate native voice mode uses local Whisper small.en.
- **Voice output:** fast browser speech synthesis is the default and speaks streamed replies as they arrive. Fish Audio is optional for a more natural voice; credentials remain only in the private `.env`.
- **Memory:** user-owned Markdown vault in `.data/vault`, containing an index, project notes, job templates, daily logs and priorities. Relevant notes are retrieved for each voice turn; completed turns are logged once. Codex can read and maintain these notes with its tools. The board's Memory orb reads the same vault. Compatible with Obsidian; no existing personal vault was scanned or imported.
- **Actions:** Gmail and Calendar get-profile calls succeeded through the real Codex bridge. Computer-use tools are discoverable, but inventory does not prove all desktop actions. The board's command endpoint can present notes and allowed media. Queued board commands are not called visible until the rendered state confirms them.

## Voice controls

In browser mode, click the orb once to enable wake listening; the page replies “Yes?” to the wake phrase and resumes listening after spoken answers. A chat panel also accepts typed messages. Click the orb or Stop to turn the microphone off. Use Chrome or Edge for browser speech recognition. Low reasoning effort is the default to favor quick voice turns. The microphone can hear room speech while enabled; only requests after “Hey Jarvis” are sent to Codex.

**Compact the session** requests Codex compaction. **Set effort to low/medium/high/xhigh** changes reasoning effort. Deep/fast voice presets change effort on the same Codex model. **Usage report** reports completed voice turns; it does not invent token costs. Unlike the Claude version, clearing the saved session and blanket auto-approval are not enabled. Platform permissions remain in force; approvals apply to individual actions. Unsupported approval types fail closed.

## Launchers and ownership

Launchers use the existing source folder and track exact process IDs plus creation timestamps. Repeated launches reuse services. Stop interrupts the active voice turn, then stops only matching owned processes. **Chat with Jarvis.cmd** resumes the same conversation in the Codex terminal; do not use it concurrently with voice. The root page has a live chat panel and typed-message input alongside voice controls.

## Tested on 10 November 2026

- All 13 automated tests passed. Board command delivery and HTTP boundary checks passed. Repeated launch, complete stop (all three listeners closed), and restart passed with child-process tracking.

- Latest Codex bridge smoke check: short reply completed in 2.72 seconds; Fish Audio returned playable MP3 audio. Duplicate submission returned the same turn, SSE replay worked, interruption completed.
- Native test: actual microphone stream opened (1,600 samples, no overflow); a known Fish sample was transcribed locally; that transcript reached a real ephemeral Codex test session; the response played through the native speaker stream and published a fresh 64-sample waveform. The generated audio input avoids inventing a user-spoken result. Real user speech through the Home key remains to be exercised by the user.
- Local Kokoro generated 73,200 samples at 24 kHz. Whisper transcription works offline after model installation.
- All four original visual faces and core verified byte-for-byte against upstream; the circuit-board screen was checked in the browser.
- Webcam gesture operation and immediate desktop Recent/history synchronization remain unverified. No extra saved test chat was created; test sessions were ephemeral.

## Installation and updates

The original local installation is already configured and running. The source ZIP excludes credentials, memory, logs, model caches, and the Python runtime. On a separate installation: install Node.js, Python (to bootstrap the isolated voice runtime), and Codex, sign in to Codex, run **Install Local Voice.cmd**, and configure Fish privately in `.env` or choose local Kokoro. The destination thread ID is personal to this installation.

`requirements-voice.lock` records tested dependency versions. `stack/upstream-lock.json` records exact upstream commits. `node check-updates.mjs` reports newer upstream commits without overwriting the Codex adaptation or memory. Ask Codex to apply updates and retest the adapter.

## Source and licensing

Based on Jared Rhodenizer's [fullstack-agent](https://github.com/jaredrhod/fullstack-agent), [backtalk](https://github.com/jaredrhod/backtalk), [ai-visualizer](https://github.com/jaredrhod/ai-visualizer), [barehands](https://github.com/jaredrhod/barehands), and [ai-memory-vault](https://github.com/jaredrhod/ai-memory-vault). See LICENSE and THIRD-PARTY-NOTICES.md. Code adaptations are AGPL-3.0-or-later; upstream memory templates retain CC BY-SA 4.0. Full source is included.

Codex protocol: https://learn.chatgpt.com/docs/app-server
