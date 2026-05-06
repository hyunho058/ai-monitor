import * as fs from 'fs';
import * as path from 'path';
import { State, ILogProvider, ActiveAgent, FileActivity, Task } from '../types/state.js';
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
  private agents: Map<string, ActiveAgent> = new Map();
  private allPendingTools: Map<string, { name: string; startTime: number; toolType: 'agent' | 'skill' | 'file'; skillName?: string }> = new Map();
  private pendingFileActivities: Map<string, FileActivity> = new Map();
  private tasks: Map<string, Task> = new Map();
  private lineBuffer = '';
  private lastNewBytesTime: number | null = null;

  constructor(filePath?: string) {
    this.autoDetect = !filePath;
    this.filePath = filePath ?? null;
    this.state = this.makeInitialState();
    if (filePath) {
      this.state.projectName = deriveProjectName(filePath);
    }
  }

  private makeInitialState(): State {
    return {
      sessionId: '',
      projectName: '',
      model: '',
      contextUsed: 0,
      uptimeMs: 0,
      idleMs: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      toolCounts: {},
      activeAgents: [],
      recentTools: [],
      recentSkills: [],
      fileActivities: [],
      tasks: [],
      pendingQuestion: null,
      parseErrors: 0,
      connectionStatus: 'waiting',
    };
  }

  getState(): State {
    const now = Date.now();
    const GRACE_PERIOD_MS = 30_000;

    const activeAgents: ActiveAgent[] = Array.from(this.agents.values())
      .map(agent => ({
        ...agent,
        elapsedMs: agent.completed 
          ? (agent.endTime! - agent.startTime) 
          : Math.max(0, now - agent.startTime),
      }))
      .filter(agent => {
        if (!agent.completed) return true;
        const age = now - (agent.endTime ?? 0);
        return age <= GRACE_PERIOD_MS;
      });

    const tasks: Task[] = Array.from(this.tasks.values())
      .filter(task => {
        if (task.status === 'active') return true;
        const endTime = task.startTime + (task.durationMs ?? 0);
        return (now - endTime) <= GRACE_PERIOD_MS;
      })
      .map(task => ({
        ...task,
        durationMs: task.status === 'active'
          ? Math.max(0, now - task.startTime)
          : task.durationMs,
      }));

    return {
      ...this.state,
      uptimeMs: this.firstEventTime ? Math.max(0, now - this.firstEventTime) : 0,
      idleMs: this.lastEventTime ? Math.max(0, now - this.lastEventTime) : 0,
      activeAgents,
      tasks,
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
    this.agents.clear();
    this.allPendingTools.clear();
    this.pendingFileActivities.clear();
    this.tasks.clear();
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

    // Usage: contextUsed = total context visible to model (includes cache hits)
    // totalTokens = cumulative billed tokens across all turns
    const usage = extractUsage(event);
    if (usage) {
      const inp = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
      const out = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
      const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
      const cacheCreate = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
      const totalContext = inp + cacheRead + cacheCreate;
      if (totalContext > 0) this.state.contextUsed = totalContext;
      this.state.totalTokens += inp + out;
      this.state.inputTokens += inp;
      this.state.outputTokens += out;
      this.state.cacheReadTokens += cacheRead;
      this.state.cacheCreationTokens += cacheCreate;
    }

    const topType = typeof event.type === 'string' ? event.type : '';

    // Top-level tool_use / tool_result events
    if (topType === 'tool_use') {
      this.handleToolUse(event, eventTime);
    } else if (topType === 'tool_result') {
      this.handleToolResult(event, eventTime);
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

    // User message: extract tool_result from content array OR skill command invocations
    if (topType === 'user' && event.message && typeof event.message === 'object') {
      const msg = event.message as JsonEvent;
      if (Array.isArray(msg.content)) {
        for (const item of msg.content as JsonEvent[]) {
          if (item.type === 'tool_result') this.handleToolResult(item, eventTime);
        }
      }
      // Skill invocations arrive as plain string content with <command-name>/skill</command-name>
      if (typeof msg.content === 'string') {
        const match = msg.content.match(/<command-name>\/([^<]+)<\/command-name>/);
        if (match) {
          const skillName = '/' + match[1];
          this.state.recentSkills.unshift({ name: skillName, startTime: eventTime });
          if (this.state.recentSkills.length > 5) this.state.recentSkills.pop();
        }
      }
    }
  }

  private handleToolUse(event: JsonEvent, eventTime: number): void {
    const name = typeof event.name === 'string' ? event.name : null;
    if (!name) return;

    this.state.toolCounts[name] = (this.state.toolCounts[name] ?? 0) + 1;

    const id = (typeof event.id === 'string' ? event.id : null) ??
               (typeof event.tool_use_id === 'string' ? event.tool_use_id : null);

    const toolType = classifyTool(name);

    if (id) {
      this.allPendingTools.set(id, { name, startTime: eventTime, toolType });

      if (name === 'AskUserQuestion') {
        const input = (event.input && typeof event.input === 'object')
          ? (event.input as Record<string, unknown>)
          : {};
        const q = typeof input.question === 'string' ? input.question : '(waiting for input)';
        this.state.pendingQuestion = q;
      } else if (name === 'Agent') {
        const input = (event.input && typeof event.input === 'object')
          ? (event.input as Record<string, unknown>)
          : {};
        const subagentType = typeof input.subagent_type === 'string' ? input.subagent_type : '';
        const desc = typeof input.description === 'string' ? input.description : '';
        const prompt = typeof input.prompt === 'string' ? input.prompt : '';
        const task = (subagentType || desc || prompt || '(agent)').slice(0, 100);
        const parentId = (typeof input.parentId === 'string' ? input.parentId : null) ??
                         (typeof input.parent_id === 'string' ? input.parent_id : null);

        this.agents.set(id, {
          id,
          task,
          startTime: eventTime,
          elapsedMs: 0,
          completed: false,
          parentId: parentId ?? undefined,
        });

        if (!parentId) {
          this.tasks.set(id, {
            id,
            description: task,
            status: 'active',
            startTime: eventTime,
          });
        }
      } else if (name === 'Skill') {
        const input = (event.input && typeof event.input === 'object')
          ? (event.input as Record<string, unknown>)
          : {};
        const skillName = typeof input.skill === 'string' ? input.skill : '(skill)';
        const pending = this.allPendingTools.get(id);
        if (pending) pending.skillName = skillName;
      } else if (toolType === 'file') {
        const input = (event.input && typeof event.input === 'object')
          ? (event.input as Record<string, unknown>)
          : {};
        const path = extractFilePath(name, input);
        const operation = fileOperation(name);
        const activity: FileActivity = { operation, path, status: 'pending', startTime: eventTime };
        this.pendingFileActivities.set(id, activity);
      }
    }
  }

  private handleToolResult(event: JsonEvent, eventTime: number): void {
    const toolUseId =
      (typeof event.tool_use_id === 'string' ? event.tool_use_id : null) ??
      (typeof event.id === 'string' ? event.id : null);

    if (!toolUseId) return;

    const pending = this.allPendingTools.get(toolUseId);
    if (pending) {
      const durationMs = eventTime - pending.startTime;
      const isError = !!event.is_error;
      const status: 'success' | 'failure' = isError ? 'failure' : 'success';

      if (pending.name === 'AskUserQuestion') {
        this.state.pendingQuestion = null;
      } else if (pending.name === 'Skill') {
        this.state.recentSkills.unshift({
          name: pending.skillName ?? '(skill)',
          startTime: pending.startTime,
        });
        if (this.state.recentSkills.length > 5) this.state.recentSkills.pop();
      } else if (pending.toolType === 'file') {
        const activity = this.pendingFileActivities.get(toolUseId);
        if (activity) {
          activity.status = status;
          activity.durationMs = durationMs;
          this.state.fileActivities.unshift(activity);
          if (this.state.fileActivities.length > 10) this.state.fileActivities.pop();
          this.pendingFileActivities.delete(toolUseId);
        }
      } else {
        this.state.recentTools.unshift({
          name: pending.name,
          status,
          startTime: pending.startTime,
          durationMs,
        });
        if (this.state.recentTools.length > 10) this.state.recentTools.pop();
      }

      this.allPendingTools.delete(toolUseId);

      const agent = this.agents.get(toolUseId);
      if (agent) {
        agent.completed = true;
        agent.endTime = eventTime;
      }

      const task = this.tasks.get(toolUseId);
      if (task) {
        task.status = isError ? 'failed' : 'completed';
        task.durationMs = durationMs;
      }
    }
  }
}

const FILE_TOOLS: Record<string, FileActivity['operation']> = {
  Read: 'read',
  Write: 'write',
  Edit: 'write',
  Grep: 'grep',
  Glob: 'list',
};

function classifyTool(name: string): 'agent' | 'skill' | 'file' {
  if (name === 'Agent') return 'agent';
  if (name === 'Skill') return 'skill';
  if (name in FILE_TOOLS) return 'file';
  return 'skill';
}

function fileOperation(name: string): FileActivity['operation'] {
  return FILE_TOOLS[name] ?? 'other';
}

function extractFilePath(toolName: string, input: Record<string, unknown>): string {
  const candidates = ['path', 'file_path', 'filePath', 'pattern', 'directory', 'dir'];
  for (const key of candidates) {
    if (typeof input[key] === 'string') return input[key] as string;
  }
  return toolName;
}

function deriveProjectName(filePath: string): string {
  const dirName = path.basename(path.dirname(filePath));
  const parts = dirName.split('-').filter(p => p.length > 0);
  return parts[parts.length - 1] ?? dirName;
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
