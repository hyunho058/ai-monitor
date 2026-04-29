# AGENT.md

## Project Overview
**ccmonitor-lite / ai-monitor**
This project serves a dual purpose:
1. **ccmonitor-lite**: A lightweight TUI (Text User Interface) dashboard for macOS terminals that monitors Claude Code (or other AI agent) sessions in real-time. It visualizes background tasks, resource usage, token counts, and tool invocations by tailing `~/.claude/projects/*/session.jsonl`.
2. **Agent Harness Ecosystem**: A collection of skills, hooks, and agent configurations designed to standardize AI interactions (e.g., `/scaffold`, `/qa`, `/check-harness`, `/doc-drift`).

## Technology Stack
- **Runtime:** Node.js (v24+)
- **Language:** TypeScript (`tsx` for execution)
- **Module System:** ESM (`"type": "module"` in `package.json` is strictly enforced)
- **UI Libraries:** 
  - `cli-table3` (Table layouts)
  - `chalk@5` (Terminal styling, ESM-only)
  - `log-update@6` (Flicker-free console updates, ESM-only)

## Development Commands
- `npm run dev` or `npm start`: Starts the TUI dashboard using `tsx src/index.ts`.

## Architecture & Constraints
1. **No Heavy UI Frameworks:** Do NOT use React-ink, Blessed, or any virtual DOM libraries. Stick to `cli-table3`, `chalk`, and `log-update`.
2. **LogTailer/Renderer Separation:** 
   - **LogTailer (`src/parser/logTailer.ts`):** Reads and parses data (currently local `session.jsonl` using `readline` streaming).
   - **Renderer:** Takes a `State` object and renders it to the screen. 
   - This separation ensures we can easily add new data sources (like WebSockets) in the future.
3. **Data Handling:** 
   - Parse `session.jsonl` dynamically.
   - Ignore malformed lines or unknown fields instead of crashing (`state.parseErrors` metric).
4. **Agent/Harness Context:**
   - Skills are located in the `skills/` directory.
   - When modifying or adding skills, ensure documentation is updated consistently (e.g., `SKILL.md`).

## Development Guidelines for AI Agents
- **ESM Strictness:** Always use `.js` extensions in relative imports if tsc output is needed, but `tsx` handles execution directly. Ensure any new dependencies support ESM natively or default imports.
- **Incremental Changes:** This is a localized TUI. Focus on fast rendering (2-second intervals) and avoiding terminal jitter.
- **Graceful Failures:** The app should handle missing log files (Waiting state) or disconnected streams (Frozen state) gracefully without exiting.
