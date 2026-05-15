# Deep Interview Insights: Gemini CLI TUI Dashboard Integration
> Date: 2026-05-15
> Rounds: 6
> Final Ambiguity Score: 0.20

## Core Problem
The ai-monitor dashboard currently only monitors Claude Code sessions; it needs to be extended to also monitor Gemini CLI sessions, displayed consistently using the same UI boxes with semantically equivalent data mapped to each box per provider.

## Key Insights & Decisions
- **Semantic mapping over structural parity**: the same five UI boxes render for all providers, populated with the closest conceptual equivalent — not a structural match of field names
- **No union type needed**: the existing `ActiveAgent` interface is reused for Gemini by mapping tool function name → `subagentType`, with `parentId` always absent (flat list, no tree)
- **Skills box = slash commands for Gemini**: detect user messages starting with `/` (`/chat`, `/memory`, `/tools`) — same box, different detection path
- **Provider filter is additive**: `c` and `g` keys filter the mixed pool; `tab` still cycles all sessions when no filter is active
- **Gemini session lifecycle is multi-day**: one `.jsonl` file per conversation, spanning days — the 15-min mtime cutoff does not apply; must parse `lastUpdated` from the JSONL first line (Option C)

## Defined Requirements
- `autoDetect.ts` must scan both `~/.claude/projects/**/*.jsonl` and `~/.gemini/tmp/<project_hash>/chats/*.jsonl` automatically on `npm start` — zero flags required
- Session "active" state for Gemini determined by reading `lastUpdated` from the first line of the JSONL file, not filesystem mtime
- Active Agents box for Gemini: flat list of in-progress tool calls (`tool_use` events without matching `tool_result`); `subagentType` = tool function name; `parentId` always absent
- Skills box for Gemini: detect user-role messages where text starts with `/`; display the command name
- Context % bar: add Gemini models to `MODEL_LIMITS` table — gemini-2.5-pro and gemini-2.5-flash are both 1M token context windows
- Token fields: `cached` maps to cache display; `thoughts` tokens need a display cell (no Claude equivalent)
- Keybindings: `c` → Claude-only session filter, `g` → Gemini-only session filter, `tab` → cycle all sessions in mixed pool
- Existing `.json` session files (old Gemini format) must also be read for backwards compatibility

## Identified Risks & Failure Modes
- **JSONL migration in progress**: Gemini CLI is actively migrating from `.json` to `.jsonl` — parser must handle both file extensions
- **`lastUpdated` field may be absent**: fallback to filesystem mtime if the field is missing from the first JSONL line
- **Model name variability**: Gemini model strings may include preview suffixes (e.g. `gemini-2.5-pro-preview-05-06`) — needs fuzzy/prefix matching against `MODEL_LIMITS`
- **`cacheCreation` tokens**: no Gemini equivalent — cell shows zero or is conditionally hidden for Gemini sessions
- **Empty provider filter**: pressing `g` with no active Gemini sessions needs a clear UX response

## Open Questions & Unknowns
- What should the Skills box title read for Gemini sessions — "Skills", "Commands", or a unified label?
- Exact field name for last-turn timestamp in Gemini's `session_metadata` record (`lastUpdated` is inferred — needs verification against a real file)
- Should `thoughts` tokens get their own display cell, or be folded into the input token count?
- Does the `c`/`g` filter persist across tab presses, or does tab always reset to the full pool?

## Clarity Assessment
Ambiguity Score: 0.20 ✅
- Goal Clarity:       0.88  (40%)
- Constraint Clarity: 0.70  (30%)
- Success Criteria:   0.80  (30%)

Maturity: Solid — all key architectural decisions made; ready for /specify or /tui-pipeline-orchestrator
