# Agent Transfer

Move your local setup between **Claude Code and Codex** in either direction. Agent Transfer copies compatible skills and their supporting files, translates project instructions such as `CLAUDE.md` and `AGENTS.md`, and can make past project conversations searchable in the other agent. A preview shows what will transfer, what conflicts with existing files, and what needs manual attention.

[Visit the Agent Transfer landing page](https://agent-transfer-sepia.vercel.app/)

## Install

You need Node.js 20 or later, npm, and the coding agents you want to use. Clone the repository and install the CLI and skill:

```sh
git clone https://github.com/SachchitBalamurugan/agent-transfer.git
cd agent-transfer
npm ci
npm link
agent-transfer install claude
agent-transfer install codex
```

Keep the cloned folder in place because `npm link` points to it. Open a **new session** in Claude Code or Codex so it can discover the skill.

## Use it in your agent

Open the project you want to transfer and ask:

> Use Agent Transfer to preview moving my Claude Code setup and this project’s chat history into Codex.

Review the proposed changes, then ask the agent to apply the preview. To go the other way, swap Claude Code and Codex in the request. After importing history, try asking, “Find the conversation where we decided how retries should work and bring the relevant messages into this session.”

## Use it from the terminal

From the project you want to migrate, export your Claude Code setup and preview it for Codex:

```sh
agent-transfer export claude my-setup.agentpack --project . --history
agent-transfer preview codex my-setup.agentpack
```

Read the preview and replace `REVISION_FROM_PREVIEW` with its `revision` value:

```sh
agent-transfer import codex my-setup.agentpack --revision REVISION_FROM_PREVIEW
```

- **Reverse direction:** export from `codex` and use `claude` for preview and import.
- **History:** omit `--history` to leave conversations out. Search imported history with `agent-transfer search "retry" --project .`, then run `agent-transfer handoff RESULT_ID` to read the matching conversation in context.
- **Another computer:** install the CLI there, copy the bundle, and run `agent-transfer inspect my-setup.agentpack` to see its project IDs. Add the same mapping, such as `--map "p1=/path/to/project"`, to both preview and import. The destination directory must exist.
- **Undo:** use the transaction ID from the import to run `agent-transfer undo TRANSACTION_ID`. Undo applies to the most recent import and preserves later edits.

Bundles are local, unencrypted files. They can contain private instructions and conversations. Keep them private and reconnect services that require credentials on the destination machine.

Run `agent-transfer help` for all commands or `npm test` from the cloned repository to verify the CLI with temporary profiles.
