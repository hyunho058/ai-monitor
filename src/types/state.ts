export interface ActiveAgent {
  id: string;
  task: string;
  elapsedMs: number;
  startTime: number;
}

export interface State {
  sessionId: string;
  model: string;
  contextUsed: number;
  uptimeMs: number;
  idleMs: number;
  totalTokens: number;
  toolCounts: Record<string, number>;
  activeAgents: ActiveAgent[];
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
