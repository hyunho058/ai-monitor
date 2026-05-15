# ai-monitor

A real-time TUI dashboard for monitoring AI agent sessions. Watches Claude Code and Gemini CLI session logs and renders live stats in the terminal.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue) ![Node.js](https://img.shields.io/badge/Node.js-ESM-green)

## Features

- **Multi-session pool** — auto-detects all active Claude Code and Gemini CLI sessions; navigate between them with `Tab`
- **Live metrics** — context usage %, token counts (input/output/cache/thoughts), uptime, idle time
- **Active Agents** — tracks spawned subagents with elapsed time, type, and description
- **Recent Tools** — shows the last tool calls with status (pending / success / failure)
- **Recent Skills** — displays slash commands invoked (`/compact`, `/harness-ops:specify`, etc.)
- **File Activity** — read/write/grep/list operations with file paths and status
- **Tasks** — active and completed task list derived from TodoWrite events
- **Connection status** — connected / frozen / waiting per session
- **Scroll support** — keyboard navigation through tall output
- **Provider filter** — toggle between Claude-only, Gemini-only, or all sessions

## Supported providers

| Provider | Log location |
|----------|-------------|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Gemini CLI | `~/.gemini/tmp/<hash>/chats/*.jsonl` and `*.json` |

> **Note:** These paths are internal filesystem conventions observed from the CLI tools, not officially documented APIs. They may change in future versions of Claude Code or Gemini CLI.

## Requirements

- Node.js 18+
- Claude Code and/or Gemini CLI installed (at least one active session to monitor)

## Installation

```bash
git clone https://github.com/hyunho058/ai-monitor.git
cd ai-monitor
npm install
```

## Usage

```bash
# Auto-detect mode — monitors all recent sessions
npm start

# Single-file mode — monitor one specific session file
npm start ~/.claude/projects/my-project/session.jsonl
```

Auto-detect mode discovers all sessions modified within the last 15 minutes (Claude) or 7 days (Gemini) and shows them one at a time. Single-file mode watches only the given file.

### Keyboard shortcuts

| Key | Action | Mode |
|-----|--------|------|
| `↑` / `↓` or `k` / `j` | Scroll up / down | Both |
| `r` | Force re-render | Both |
| `q` / `Ctrl+C` | Quit | Both |
| `Tab` | Cycle to next session | Auto-detect only |
| `c` | Toggle Claude-only filter (press again to clear) | Auto-detect only |
| `g` | Toggle Gemini-only filter (press again to clear) | Auto-detect only |

## Architecture

```
src/
├── index.ts              # Entry point — session pool, render loop, key handling
├── types/
│   └── state.ts          # State interface shared across all modules
├── parser/
│   ├── logTailer.ts      # Claude Code JSONL parser (streaming, incremental)
│   ├── geminiLogTailer.ts # Gemini CLI JSONL/JSON parser
│   └── autoDetect.ts     # Discovers active session files on disk
└── ui/
    ├── renderer.ts        # Top-level render function — composes all boxes
    └── components/
        ├── header.ts      # Session header (model, tokens, context %)
        ├── agentsBox.ts   # Active Agents table
        ├── toolsBox.ts    # Recent Tools table
        ├── skillsBox.ts   # Recent Skills list
        ├── fileActivityBox.ts # File Activity table
        ├── tasksBox.ts    # Tasks table
        └── utils.ts       # Shared formatting helpers
```

**Data flow:** `autoDetect` → `LogTailer`/`GeminiLogTailer` (JSONL → `State`) → `renderer` (chalk + cli-table3 → terminal via log-update)

## Development

Type-check without building:

```bash
npx tsc --noEmit
```

Run directly with `tsx` (no compile step needed):

```bash
npm run dev
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `chalk` | Terminal colors |
| `cli-table3` | Bordered tables |
| `log-update` | Flicker-free terminal refresh |
| `tsx` | TypeScript execution without a build step |
