export interface ActiveAgent {
  id: string;
  task: string;
  elapsedMs: number;
  startTime: number;
  parentId?: string;
  completed: boolean;
  endTime?: number;
}

export interface RecentTool {
  name: string;
  status: 'pending' | 'success' | 'failure';
  startTime: number;
  durationMs?: number;
}

export interface RecentSkill {
  name: string;
  startTime: number;
}

export interface FileActivity {
  operation: 'read' | 'write' | 'grep' | 'list' | 'other';
  path: string;
  status: 'pending' | 'success' | 'failure';
  startTime: number;
  durationMs?: number;
}

export interface Task {
  id: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  startTime: number;
  durationMs?: number;
}

export interface State {
  sessionId: string;
  projectName: string;
  model: string;
  contextUsed: number;
  uptimeMs: number;
  idleMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  toolCounts: Record<string, number>;
  activeAgents: ActiveAgent[];
  recentTools: RecentTool[];
  recentSkills: RecentSkill[];
  fileActivities: FileActivity[];
  tasks: Task[];
  pendingQuestion: string | null;
  parseErrors: number;
  connectionStatus: 'connected' | 'waiting' | 'frozen';
}

export interface ILogProvider {
  getState(): State;
  getCurrentFile(): string | null;
  start(): void;
  stop(): void;
  switchFile(newPath: string): void;
}

export type RenderFn = (state: State, cols: number) => void;
