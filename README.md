# Agent Transfer

Move skills, project instructions, and searchable conversation history between Claude Code and Codex. Preview each change before applying it, and undo a transfer if needed.

[Visit the landing page](https://agent-transfer-sepia.vercel.app/) · [Watch the captioned launch film](https://agent-transfer-sepia.vercel.app/launch.mp4) · [Get VoiceStudio for your own narration](https://github.com/debpalash/VoiceStudio/releases/latest)

A local CLI and installable skill for on-demand Claude Code ↔ Codex transfers. Requires Node.js 20 or later. From this directory run `npm install`, `npm test`, and `npm link`. Install the skill with `agent-transfer install claude` and `agent-transfer install codex`. Start a new agent session after installation.

## Move a setup

```sh
agent-transfer export claude my-setup.agentpack --project "/path/to/project" --history
agent-transfer inspect my-setup.agentpack
agent-transfer preview codex my-setup.agentpack --map "p1=/path/on/this/machine"
agent-transfer import codex my-setup.agentpack --map "p1=/path/on/this/machine" --revision HASH_FROM_PREVIEW
agent-transfer search "retry" --project "/path/on/this/machine"
agent-transfer handoff RESULT_ID --phrase "retry"
agent-transfer undo TRANSACTION_ID
```

Swap the agent names to go the other way. Repeat --project for additional folders. A private .agentpack file can travel to another machine. Transfer the CLI separately and map each project ID to an existing directory there. For a same-machine move the project paths default to the originals. A new export needs a new filename.

Plain skills include their scripts and assets. Commands containing simple Markdown can become skills. Nested project instructions keep their directory scope. Verified MCP transport subsets and project-level model effort settings are translated. The preview lists server launch commands or endpoints. Model effort availability depends on the selected model. Plugin activation, host-specific hooks, scoped rules, model-specific options and reconnect requirements may need manual work.

History collection is opt-in and limited to selected project roots. Search and handoff use a local index stored under ~/.agent-transfer. Imported conversations open as historical context in a new session. Journals in the same directory contain the original target files for recovery or undo. The latest committed transaction can be undone; subsequent edits are preserved. After an interruption use agent-transfer recover.

The bundle is gzip-compressed JSON with a versioned manifest and SHA-256 integrity check. Anyone with the file can read it. Known credential stores and secret patterns are filtered. Arbitrary text, binary assets, transcripts and references may contain sensitive material. Use inspect for the inventory and a gzip/JSON viewer for reviewing full contents. Account sign-ins, OS keychains, managed policies, and cloud-only histories stay with their host. A bundle checksum detects corruption and does not establish publisher identity.

## Format

Version 1 wraps {bundle, sha256}. The digest covers the UTF-8 JSON representation of the bundle with recursively sorted object keys. The bundle contains source, projects, items, notes, and version. Project IDs are portable and path mappings are supplied at import. Each item has scope, type and key; file payloads are base64, archived threads contain scrubbed transcript records and normalized messages. Adapter functions collect source records and compute destination changes before transaction application. User scopes use the agent's home directories, including configured overrides.

## Verification

npm test uses private temporary homes and synthetic projects. It exercises transfer in both directions, script and template discovery, project remapping, duplicate avoidance, search, stale previews, undo and journal recovery. A live-agent acceptance check additionally requires starting a new session in each installed host and invoking the transferred fixture skill.

## Landing page and launch animation

Run `npm run build` to create the static page, a downloadable source archive and the captioned launch GIF in `dist/`. The page plays the short on request. Vercel's build runs the test suite before creating public assets. The optional workflow in ci/github-actions.yml runs the tests and build on Linux, macOS and Windows when installed under .github/workflows/.

The launch short uses the script in `launch/script.txt`. The captioned cut lasts 35.3 seconds. With FFmpeg and its libx264 encoder available on PATH, `npm run film` renders a 1080 × 1920 H.264 MP4 at 30 fps.

### Add your voice locally

Open [VoiceStudio](https://github.com/debpalash/VoiceStudio), create a voice profile from a clean recording of yourself, and select an engine whose license covers your intended use. Run `npm run voice` to list your local voice profiles, then `npm run voice -- YOUR_PROFILE_ID`. The renderer requests mono PCM for each caption, calculates its duration from the returned samples, and writes the narration and cue timings to `launch/private/`. Run `npm run film:voice` to produce `dist/launch-voiced.mp4`. The source ZIP and website build exclude recordings, profile IDs, and generated voice tracks. The adapter uses the [local speech synthesis API](https://github.com/debpalash/VoiceStudio/blob/main/docs/elevenlabs-api.md).

The original train-terminal artwork can be rendered with Python, Mitsuba 3, NumPy and Pillow using `python site/render-terminal.py site/terminal.webp`. The animation uses a pixel rendition of the [Claude mark from Simple Icons](https://cdn.simpleicons.org/claude/D97757).

The CLI, original illustration, animation code and landing page are MIT licensed. Product names and associated marks identify their respective tools.
