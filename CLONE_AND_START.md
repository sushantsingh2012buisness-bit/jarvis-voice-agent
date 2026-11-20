# Clone and start Jarvis (LLM agent checklist)

Use this after the user asks you to set up Jarvis from this repository.

```powershell
git clone https://github.com/nishagini/jarvis-voice-agent.git
Set-Location jarvis-voice-agent
```

1. Read `README.md` and `AGENTS.md`.
2. Check that Node.js 22+ and Python are available. Check Codex CLI is installed and `codex login status` succeeds; do not display credentials.
3. If `.runtime/voice/Scripts/python.exe` is missing, run `Install Local Voice.cmd` and wait for it to finish. This downloads dependencies; speech models download the first time they are used.
4. Copy `.env.example` to `.env` if `.env` does not exist. Fish Audio is optional; only ask the user for a Fish key if they specifically want Fish TTS. Never place secrets in repository files or chat logs.
5. Start with `Talk to Jarvis.cmd`. Open `http://127.0.0.1:4320/faces/board/` in a browser on the same computer.
6. Wait for the user to try **“Hey Jarvis, what is two plus two?”** and confirm they hear the spoken reply. Do not claim the physical microphone/speaker loop passed until they confirm it.
7. If the user wants the gesture board, separately run `Jarvis Barehands.cmd`, open `http://127.0.0.1:8794/stage.html` in Chrome, and request camera permission.

Use only a harmless test prompt. Do not send email/messages, publish content, change calendars, or run consequential actions while smoke-testing.
