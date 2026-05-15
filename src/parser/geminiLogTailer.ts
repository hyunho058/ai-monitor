import * as fs from 'fs';
import * as path from 'path';
import { State, ILogProvider, ActiveAgent, RecentSkill } from '../types/state.js';

type JsonObj = Record<string, unknown>;

// Connection status thresholds
const CONNECTED_THRESHOLD_MS = 15 * 60 * 1000;   // 15 min
const FROZEN_THRESHOLD_MS    = 60 * 60 * 1000;    // 60 min

// ── Gemini-specific record shapes ─────────────────────────────────────────────

interface GeminiTokens {
  input?: number;
  output?: number;
  cached?: number;
  thoughts?: number;
  tool?: number;
  total?: number;
}

interface GeminiToolCall {
  id?: string;
  name?: string;
  args?: unknown;
  result?: unknown;
  status?: string;       // 'success' | 'pending' | ...
  timestamp?: string;
  description?: string;
  displayName?: string;
}

interface GeminiRecord extends JsonObj {
  type?: string;
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  lastUpdated?: string;
  kind?: string;
  timestamp?: string;
  content?: unknown;
  displayContent?: unknown;
  thoughts?: unknown[];
  tokens?: GeminiTokens;
  model?: string;
  toolCalls?: GeminiToolCall[];
  $set?: { lastUpdated?: string };
  messages?: JsonObj[];  // .json full-file format
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIsoMs(s: string | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function getFileOperation(toolName: string): State['fileActivities'][number]['operation'] | null {
  const name = toolName.toLowerCase();
  if (name.includes('read_file')) return 'read';
  if (name.includes('write_file') || name.includes('replace')) return 'write';
  if (name.includes('grep')) return 'grep';
  if (name.includes('list') || name.includes('glob')) return 'list';
  if (name.includes('file') || name.includes('directory')) return 'other';
  return null;
}

function getFilePath(args: any): string {
  if (!args || typeof args !== 'object') return '';
  return args.path || args.file_path || args.dir_path || args.filePath || args.dirPath || '';
}

/**
 * Derive a human-readable project name from the file path.
 * The path is typically: ~/.gemini/tmp/<hash>/chats/session-*.jsonl
 * We use the hash directory (2 levels up from the file) as the project name,
 * truncated to 12 chars so it fits in the header.
 */
function deriveProjectName(filePath: string): string {
  // 2 levels up: chats/ → <hash>/
  const hashDir = path.basename(path.dirname(path.dirname(filePath)));
  return hashDir.slice(0, 12) || 'gemini';
}

function makeInitialState(filePath: string): State {
  return {
    sessionId:           '',
    projectName:         deriveProjectName(filePath),
    model:               '',
    contextUsed:         0,
    uptimeMs:            0,
    idleMs:              0,
    totalTokens:         0,
    inputTokens:         0,
    outputTokens:        0,
    cacheReadTokens:     0,
    cacheCreationTokens: 0,
    thoughtTokens:       0,
    toolCounts:          {},
    activeAgents:        [],
    recentTools:         [],
    recentSkills:        [],
    fileActivities:      [],
    tasks:               [],
    pendingQuestion:     null,
    parseErrors:         0,
    connectionStatus:    'waiting',
    provider:            'gemini',
  };
}

// ── GeminiLogTailer ───────────────────────────────────────────────────────────

export class GeminiLogTailer implements ILogProvider {
  private filePath: string;
  private state: State;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Timing anchors
  private startTimeMs: number | null = null;   // from session metadata
  private lastUpdatedMs: number | null = null; // from $set or gemini record timestamp

  // File streaming state (JSONL mode)
  private fileOffset = 0;
  private lineBuffer  = '';

  // Track whether the last processed record was a $set (Gemini-is-thinking heuristic)
  private lastRecordWasSet = false;

  // Agents map: id → ActiveAgent (kept in sync with latestToolCalls)
  private agents: Map<string, ActiveAgent> = new Map();

  // Recent skills list (slash commands from user messages)
  private recentSkills: RecentSkill[] = [];

  // Persistent tool and file activities (Map for deduplication and status updates)
  private fileActivities: Map<string, State['fileActivities'][number]> = new Map();
  private recentTools: Map<string, State['recentTools'][number]> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = makeInitialState(filePath);
  }

  // ── ILogProvider ─────────────────────────────────────────────────────────

  getState(): State {
    const now = Date.now();

    // Recompute elapsed for active agents
    const activeAgents: ActiveAgent[] = Array.from(this.agents.values()).map(agent => ({
      ...agent,
      elapsedMs: agent.completed
        ? (agent.endTime! - agent.startTime)
        : Math.max(0, now - agent.startTime),
    }));

    // Convert and sort activities
    const fileActivities = Array.from(this.fileActivities.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 10);

    const recentTools = Array.from(this.recentTools.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 10);

    return {
      ...this.state,
      uptimeMs:     this.startTimeMs  ? Math.max(0, now - this.startTimeMs)  : 0,
      idleMs:       this.lastUpdatedMs ? Math.max(0, now - this.lastUpdatedMs) : 0,
      activeAgents,
      recentSkills: [...this.recentSkills],
      fileActivities,
      recentTools,
    };
  }

  getCurrentFile(): string | null {
    return this.filePath;
  }

  start(): void {
    this.doPoll();
    this.pollTimer = setInterval(() => this.doPoll(), 1000);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  switchFile(newPath: string): void {
    this.filePath       = newPath;
    this.state          = makeInitialState(newPath);
    this.fileOffset     = 0;
    this.lineBuffer     = '';
    this.startTimeMs    = null;
    this.lastUpdatedMs  = null;
    this.lastRecordWasSet = false;
    this.agents.clear();
    this.recentSkills   = [];
    this.fileActivities.clear();
    this.recentTools.clear();
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private doPoll(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      this.state.connectionStatus = 'waiting';
      return;
    }

    if (stat.size === 0) {
      this.state.connectionStatus = 'waiting';
      return;
    }

    const ext = path.extname(this.filePath).toLowerCase();
    if (ext === '.json') {
      this.pollJson();
    } else {
      this.pollJsonl(stat);
    }

    this.updateConnectionStatus(stat);
  }

  // ── .json full-file format ────────────────────────────────────────────────

  private pollJson(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      this.state.connectionStatus = 'frozen';
      return;
    }

    let data: GeminiRecord;
    try {
      data = JSON.parse(raw) as GeminiRecord;
    } catch {
      this.state.parseErrors++;
      return;
    }

    // Process session-level fields
    if (data.sessionId) this.handleSessionMetadata(data);

    // Process messages array
    if (Array.isArray(data.messages)) {
      this.lastRecordWasSet = false;
      for (const msg of data.messages as GeminiRecord[]) {
        this.dispatchRecord(msg);
      }
    }

    // Treat the top-level lastUpdated as final $set value
    const lu = parseIsoMs(data.lastUpdated);
    if (lu !== null) this.lastUpdatedMs = lu;
  }

  // ── .jsonl streaming format ───────────────────────────────────────────────

  private pollJsonl(stat: fs.Stats): void {
    if (stat.size <= this.fileOffset) return; // no new bytes

    const newByteCount = stat.size - this.fileOffset;
    const buf = Buffer.alloc(newByteCount);

    let fd: number;
    try {
      fd = fs.openSync(this.filePath, 'r');
    } catch {
      this.state.connectionStatus = 'frozen';
      return;
    }

    let bytesRead = 0;
    try {
      bytesRead = fs.readSync(fd, buf, 0, newByteCount, this.fileOffset);
      this.fileOffset += bytesRead;
      this.lineBuffer += buf.toString('utf8', 0, bytesRead);
    } catch {
      this.state.connectionStatus = 'frozen';
      return;
    } finally {
      fs.closeSync(fd);
    }

    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.parseJsonlLine(trimmed);
    }
  }

  private parseJsonlLine(line: string): void {
    let record: GeminiRecord;
    try {
      record = JSON.parse(line) as GeminiRecord;
    } catch {
      this.state.parseErrors++;
      return;
    }
    this.dispatchRecord(record);
  }

  // ── Record dispatcher ─────────────────────────────────────────────────────

  private dispatchRecord(record: GeminiRecord): void {
    // $set record
    if ('$set' in record && record.$set && typeof record.$set === 'object') {
      const lu = parseIsoMs(record.$set.lastUpdated);
      if (lu !== null) this.lastUpdatedMs = lu;
      this.lastRecordWasSet = true;
      return;
    }

    this.lastRecordWasSet = false;

    // Session metadata line (no type field, has sessionId)
    if (!record.type && record.sessionId) {
      this.handleSessionMetadata(record);
      return;
    }

    const recType = record.type || record.kind;

    if (recType === 'user') {
      this.handleUserRecord(record);
    } else if (recType === 'gemini') {
      this.handleGeminiRecord(record);
    }
    // 'info' and others: ignore
  }

  // ── Session metadata ──────────────────────────────────────────────────────

  private handleSessionMetadata(record: GeminiRecord): void {
    if (!this.state.sessionId && record.sessionId) {
      this.state.sessionId = record.sessionId;
    }
    if (!this.startTimeMs) {
      this.startTimeMs = parseIsoMs(record.startTime);
    }
    if (record.lastUpdated) {
      const lu = parseIsoMs(record.lastUpdated);
      if (lu !== null) this.lastUpdatedMs = lu;
    }
  }

  // ── User record ───────────────────────────────────────────────────────────

  private handleUserRecord(record: GeminiRecord): void {
    // Slash commands can be in 'displayContent' (original user input)
    // or 'content' (processed prompt). We check both.
    const findSlashCommand = (content: any): string | null => {
      let text: string | null = null;
      if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as JsonObj;
        if (typeof first.text === 'string') text = first.text;
      } else if (typeof content === 'string') {
        text = content;
      } else if (content && typeof content === 'object') {
        const cObj = content as JsonObj;
        if (typeof cObj.text === 'string') text = cObj.text;
      }
      return (text && text.trimStart().startsWith('/')) ? text.trim() : null;
    };

    const commandText = findSlashCommand(record.displayContent) || findSlashCommand(record.content);

    if (commandText) {
      const ts = parseIsoMs(record.timestamp) ?? Date.now();
      // Show only the base command (first word) to keep the UI clean
      const baseCommand = commandText.split(/\s+/)[0];
      const skill: RecentSkill = { name: baseCommand, startTime: ts };
      this.recentSkills.unshift(skill);
      if (this.recentSkills.length > 10) this.recentSkills.pop();
    }
  }

  // ── Gemini record ─────────────────────────────────────────────────────────

  private handleGeminiRecord(record: GeminiRecord): void {
    // Model
    if (record.model && !this.state.model) {
      this.state.model = record.model;
    } else if (record.model) {
      // Always update to latest model name in case it changes mid-session
      this.state.model = record.model;
    }

    // Tokens — use latest record's values as current session totals (not cumulative sum)
    const tok = record.tokens;
    if (tok) {
      const input    = tok.input    ?? 0;
      const output   = tok.output   ?? 0;
      const cached   = tok.cached   ?? 0;
      const thoughts = tok.thoughts ?? 0;
      const total    = tok.total    ?? (input + output);

      this.state.inputTokens         = input;
      this.state.outputTokens        = output;
      this.state.cacheReadTokens     = cached;
      this.state.cacheCreationTokens = 0;  // no Gemini equivalent
      this.state.thoughtTokens       = thoughts;
      this.state.totalTokens         = total;
      // contextUsed: best approximation is input tokens (includes cache hits)
      this.state.contextUsed = input + cached;
    }

    // Update lastUpdated from the gemini record's timestamp
    const ts = parseIsoMs(record.timestamp);
    if (ts !== null) this.lastUpdatedMs = ts;

    // Tool calls — rebuild agents map from the latest gemini record
    const toolCalls: GeminiToolCall[] = Array.isArray(record.toolCalls)
      ? (record.toolCalls as GeminiToolCall[])
      : [];

    // Update toolCounts for every tool call in this record
    for (const tc of toolCalls) {
      if (tc.name) {
        this.state.toolCounts[tc.name] = (this.state.toolCounts[tc.name] ?? 0) + 1;
      }
    }

    // Process tool calls into File Activity and Recent Tools
    const recordTime = ts ?? Date.now();
    const forceActive = this.lastRecordWasSet;

    for (const tc of toolCalls) {
      const id = tc.id ?? tc.name ?? String(recordTime);
      const name = tc.name ?? '(tool)';
      const status: 'pending' | 'success' | 'failure' = (forceActive || tc.status !== 'success')
        ? 'pending'
        : 'success';

      const fileOp = getFileOperation(name);
      if (fileOp) {
        const path = getFilePath(tc.args);
        const existing = this.fileActivities.get(id);
        this.fileActivities.set(id, {
          operation: fileOp,
          path,
          status,
          startTime: existing?.startTime ?? recordTime,
        });
      } else {
        const existing = this.recentTools.get(id);
        this.recentTools.set(id, {
          name,
          status,
          startTime: existing?.startTime ?? recordTime,
        });
      }
    }

    // Rebuild agents (for Gemini, we only include "real" agents if any exist,
    // but based on user feedback we exclude granular tools from this box)
    this.rebuildAgents(toolCalls, recordTime);
  }

  // ── Agents reconstruction ─────────────────────────────────────────────────

  /**
   * Rebuild the agents map from the tool calls in the most recent gemini record.
   *
   * For Gemini, we exclude granular tool calls that are now routed to
   * File Activity or Recent Tools. This keeps the Active Agents box clear.
   */
  private rebuildAgents(toolCalls: GeminiToolCall[], recordTime: number): void {
    // We clear and rebuild on every gemini record so the display always
    // reflects the most recent picture. Old completed agents are discarded.
    this.agents.clear();

    // If Gemini ever supports subagents explicitly, they would be added here.
    // For now, we follow user feedback and keep granular tool calls out of this box.
  }

  // ── Connection status ─────────────────────────────────────────────────────

  private updateConnectionStatus(stat: fs.Stats): void {
    // Prefer lastUpdatedMs derived from records; fallback to file mtime
    const recencyMs = this.lastUpdatedMs ?? stat.mtimeMs;
    const age = Date.now() - recencyMs;

    if (age <= CONNECTED_THRESHOLD_MS) {
      this.state.connectionStatus = 'connected';
    } else if (age <= FROZEN_THRESHOLD_MS) {
      this.state.connectionStatus = 'frozen';
    } else {
      this.state.connectionStatus = 'waiting';
    }
  }
}
