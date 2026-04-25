import * as fs from 'fs';
import { State, ILogProvider, ActiveAgent } from '../types/state.js';
import { findLatestSession } from './autoDetect.js';

type JsonEvent = Record<string, unknown>;

// If no new bytes arrive within this window after fully reading a file, switch to FROZEN.
const FROZEN_IDLE_MS = 10_000;

export class LogTailer implements ILogProvider {
  private state: State;
  private filePath: string | null;
  private readonly autoDetect: boolean;
  private currentOffset = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private firstEventTime: number | null = null;
  private lastEventTime: number | null = null;
  private pendingAgents: Map<string, { task: string; startTime: number }> = new Map();
  private lineBuffer = '';
  private lastNewBytesTime: number | null = null;

  constructor(filePath?: string) {
    this.autoDetect = !filePath;
    this.filePath = filePath ?? null;
    this.state = this.makeInitialState();
  }

  private makeInitialState(): State {
    return {
      sessionId: '',
      model: '',
      contextUsed: 0,
      uptimeMs: 0,
      idleMs: 0,
      totalTokens: 0,
      toolCounts: {},
      activeAgents: [],
      parseErrors: 0,
      connectionStatus: 'waiting',
    };
  }

  getState(): State {
    const now = Date.now();
    const activeAgents: ActiveAgent[] = Array.from(this.pendingAgents.entries()).map(
      ([id, info]) => ({
        id,
        task: info.task,
        elapsedMs: now - info.startTime,
        startTime: info.startTime,
      })
    );
    return {
      ...this.state,
      uptimeMs: this.firstEventTime ? now - this.firstEventTime : 0,
      idleMs: this.lastEventTime ? now - this.lastEventTime : 0,
      activeAgents,
    };
  }

  getCurrentFile(): string | null {
    return this.filePath;
  }

  start(): void {
    this.doPoll();
    this.pollTimer = setInterval(() => this.doPoll(), 500);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  switchFile(newPath: string): void {
    this.filePath = newPath;
    this.currentOffset = 0;
    this.lineBuffer = '';
    this.state = this.makeInitialState();
    this.firstEventTime = null;
    this.lastEventTime = null;
    this.lastNewBytesTime = null;
    this.pendingAgents.clear();
    this.state.connectionStatus = 'waiting';
  }

  private doPoll(): void {
    if (this.autoDetect && !this.filePath) {
      const detected = findLatestSession();
      if (detected) this.filePath = detected;
    }

    if (!this.filePath) {
      this.state.connectionStatus = 'waiting';
      return;
    }

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

    if (stat.size <= this.currentOffset) {
      // No new bytes. If we've read data before and enough time has elapsed, mark frozen.
      if (
        this.currentOffset > 0 &&
        this.lastNewBytesTime !== null &&
        this.state.connectionStatus === 'connected' &&
        Date.now() - this.lastNewBytesTime > FROZEN_IDLE_MS
      ) {
        this.state.connectionStatus = 'frozen';
      }
      return;
    }

    // Read new bytes since last offset
    const newByteCount = stat.size - this.currentOffset;
    const buf = Buffer.alloc(newByteCount);
    let fd: number;
    try {
      fd = fs.openSync(this.filePath, 'r');
    } catch {
      this.state.connectionStatus = 'frozen';
      return;
    }
    try {
      const bytesRead = fs.readSync(fd, buf, 0, newByteCount, this.currentOffset);
      this.currentOffset += bytesRead;
      this.lineBuffer += buf.toString('utf8', 0, bytesRead);
    } catch {
      this.state.connectionStatus = 'frozen';
      return;
    } finally {
      fs.closeSync(fd);
    }

    // Split on newlines, keep partial last line in buffer
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.parseLine(trimmed);
    }

    this.lastNewBytesTime = Date.now();
    this.state.connectionStatus = 'connected';
  }

  // Called externally after EOF to freeze state
  markFrozen(): void {
    this.state.connectionStatus = 'frozen';
  }

  private parseLine(line: string): void {
    let event: JsonEvent;
    try {
      event = JSON.parse(line) as JsonEvent;
    } catch {
      this.state.parseErrors++;
      return;
    }

    const eventTime = parseTimestamp(event) ?? Date.now();
    if (!this.firstEventTime) this.firstEventTime = eventTime;
    this.lastEventTime = eventTime;

    // Session ID (first seen) — Claude Code uses camelCase sessionId
    if (!this.state.sessionId) {
      const sid = (typeof event.sessionId === 'string' ? event.sessionId : null) ??
                  (typeof event.session_id === 'string' ? event.session_id : null);
      if (sid) this.state.sessionId = sid;
    }

    // Model
    if (!this.state.model) {
      const model = extractModel(event);
      if (model) this.state.model = model;
    }

    // Usage (contextUsed = latest input_tokens; totalTokens = cumulative sum)
    const usage = extractUsage(event);
    if (usage) {
      const inp = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
      const out = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
      if (inp > 0) this.state.contextUsed = inp;
      this.state.totalTokens += inp + out;
    }

    const topType = typeof event.type === 'string' ? event.type : '';

    // Top-level tool_use / tool_result events
    if (topType === 'tool_use') {
      this.handleToolUse(event, eventTime);
    } else if (topType === 'tool_result') {
      this.handleToolResult(event);
    }

    // Assistant message: extract tool_use from content array
    if (topType === 'assistant' && event.message && typeof event.message === 'object') {
      const msg = event.message as JsonEvent;
      if (Array.isArray(msg.content)) {
        for (const item of msg.content as JsonEvent[]) {
          if (item.type === 'tool_use') this.handleToolUse(item, eventTime);
        }
      }
    }

    // User message: extract tool_result from content array
    if (topType === 'user' && event.message && typeof event.message === 'object') {
      const msg = event.message as JsonEvent;
      if (Array.isArray(msg.content)) {
        for (const item of msg.content as JsonEvent[]) {
          if (item.type === 'tool_result') this.handleToolResult(item);
        }
      }
    }
  }

  private handleToolUse(event: JsonEvent, eventTime: number): void {
    const name = typeof event.name === 'string' ? event.name : null;
    if (!name) return;

    this.state.toolCounts[name] = (this.state.toolCounts[name] ?? 0) + 1;

    if (name === 'Agent') {
      const id = (typeof event.id === 'string' ? event.id : null) ??
                 (typeof event.tool_use_id === 'string' ? event.tool_use_id : null);
      if (id && !this.pendingAgents.has(id)) {
        const input = (event.input && typeof event.input === 'object')
          ? (event.input as Record<string, unknown>)
          : {};
        const desc = typeof input.description === 'string' ? input.description : '';
        const prompt = typeof input.prompt === 'string' ? input.prompt : '';
        const task = (desc || prompt).slice(0, 100);
        this.pendingAgents.set(id, { task, startTime: eventTime });
      }
    }
  }

  private handleToolResult(event: JsonEvent): void {
    const toolUseId =
      (typeof event.tool_use_id === 'string' ? event.tool_use_id : null) ??
      (typeof event.id === 'string' ? event.id : null);
    if (toolUseId) this.pendingAgents.delete(toolUseId);
  }
}

function parseTimestamp(event: JsonEvent): number | null {
  const ts = event.timestamp;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (typeof ts === 'number') return ts;
  return null;
}

function extractModel(event: JsonEvent): string | null {
  if (typeof event.model === 'string') return event.model;
  if (event.message && typeof event.message === 'object') {
    const msg = event.message as JsonEvent;
    if (typeof msg.model === 'string') return msg.model;
  }
  return null;
}

function extractUsage(event: JsonEvent): Record<string, number> | null {
  if (event.usage && typeof event.usage === 'object') {
    return event.usage as Record<string, number>;
  }
  if (event.message && typeof event.message === 'object') {
    const msg = event.message as JsonEvent;
    if (msg.usage && typeof msg.usage === 'object') {
      return msg.usage as Record<string, number>;
    }
  }
  return null;
}
