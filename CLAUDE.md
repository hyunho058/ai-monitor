# ai-monitor

A TUI dashboard for real-time monitoring of AI Agent sessions (currently tailored for Claude Code JSONL sessions, but extensible). TypeScript + chalk + cli-table3 + log-update.

## Harness: TUI Pipeline Team

**Goal:** Automate the JSONL log collection (LogTailer) → parsing (State) → TUI rendering (cli-table3/chalk) pipeline development and stability verification with an agent team.

**Trigger:** Use the `tui-pipeline-orchestrator` skill for full pipeline feature development, component additions/modifications, and system stability verification requests. Simple single-file edits or questions can be answered directly.

**Change History:**
| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-04-30 | Initial setup | All | Build pipeline team harness |

## Harness: Git Workflow Team

**Goal:** Automate the commit message generation (commit-agent) → PR creation (pr-agent) workflow. commit-lint and secret-scanner hooks run automatically on every git commit.

**Trigger:** Use the `git-workflow-orchestrator` skill for commit message generation, PR creation, and git workflow requests. Hooks run automatically — no separate trigger needed.

**Change History:**
| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-05-01 | Initial setup | commit-agent, pr-agent, git-workflow-orchestrator, commit-lint, secret-scanner | Build Git workflow team harness |

## Harness: AI Monitor Maker Team

**Goal:** Design and build complete TUI monitoring dashboard applications from scratch, covering architecture design, frontend component implementation, and backend data pipeline implementation.

**Trigger:** Use the `ai-monitor-make` skill for requests to build a new monitoring dashboard, add a major feature spanning design + frontend + backend, or redo any phase of a prior maker run. Simple single-file edits can be handled directly.

**Change History:**
| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-05-04 | Initial setup | maker-design, maker-frontend, maker-backend, ai-monitor-make | Build AI Monitor Maker team harness |
