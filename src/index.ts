import * as readline from 'readline';
import { LogTailer } from './parser/logTailer.js';
import { findAllSessions } from './parser/autoDetect.js';
import { render } from './ui/renderer.js';
import { State } from './types/state.js';

const RENDER_INTERVAL_MS = 2000;

function getCols(): number {
  return process.stdout.columns ?? 120;
}

function getRows(): number {
  return process.stdout.rows ?? 40;
}

let scrollOffset = 0;
const sessionPool = new Map<string, LogTailer>();
let currentSessionPath: string | null = null;
let sortedSessionPaths: string[] = [];

const WAITING_STATE: State = {
  sessionId: '', projectName: '', model: '', contextUsed: 0, uptimeMs: 0, idleMs: 0,
  totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
  toolCounts: {}, activeAgents: [], recentTools: [], recentSkills: [], fileActivities: [],
  tasks: [], pendingQuestion: null, parseErrors: 0, connectionStatus: 'waiting',
};

function syncSessionPool(): void {
  const sessions = findAllSessions();
  sortedSessionPaths = sessions.map(s => s.path);
  const activePaths = new Set(sortedSessionPaths);

  for (const session of sessions) {
    if (!sessionPool.has(session.path)) {
      const tailer = new LogTailer(session.path);
      tailer.start();
      sessionPool.set(session.path, tailer);
    }
  }

  for (const [p, tailer] of sessionPool) {
    if (!activePaths.has(p)) {
      tailer.stop();
      sessionPool.delete(p);
    }
  }

  if (sortedSessionPaths.length === 0) {
    currentSessionPath = null;
  } else if (!currentSessionPath || !sessionPool.has(currentSessionPath)) {
    currentSessionPath = sortedSessionPaths[0];
  }
}

function getCurrentState(): State {
  if (!currentSessionPath) return WAITING_STATE;
  return sessionPool.get(currentSessionPath)?.getState() ?? WAITING_STATE;
}

function getSessionPosition(): { index: number; count: number } {
  const count = sortedSessionPaths.length;
  const idx = currentSessionPath ? sortedSessionPaths.indexOf(currentSessionPath) : -1;
  return { index: idx + 1, count };
}

function shutdown(interval: ReturnType<typeof setInterval>): void {
  clearInterval(interval);
  for (const tailer of sessionPool.values()) {
    tailer.stop();
  }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdout.write('\x1b[?1049l\x1b[?25h');
  process.exit(0);
}

function main(): void {
  const argPath = process.argv[2];

  let cols = getCols();
  let rows = getRows();

  process.stdout.write('\x1b[?1049h\x1b[?25l');

  if (argPath) {
    // Single file mode: bypass session pool
    const tailer = new LogTailer(argPath);
    tailer.start();

    scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);

    const interval = setInterval(() => {
      cols = getCols();
      rows = getRows();
      scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
    }, RENDER_INTERVAL_MS);

    process.on('SIGWINCH', () => { cols = getCols(); rows = getRows(); });

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();

      process.stdin.on('keypress', (_, key) => {
        if (!key) return;
        if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
          clearInterval(interval);
          tailer.stop();
          if (process.stdin.isTTY) process.stdin.setRawMode(false);
          process.stdout.write('\x1b[?1049l\x1b[?25h');
          process.exit(0);
        }
        if (key.name === 'r') {
          cols = getCols(); rows = getRows();
          scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
        }
        if (key.name === 'j' || key.name === 'down') {
          scrollOffset++;
          scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
        }
        if (key.name === 'k' || key.name === 'up') {
          if (scrollOffset > 0) {
            scrollOffset--;
            scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
          }
        }
      });
    }

    process.on('SIGINT', () => { clearInterval(interval); tailer.stop(); process.stdout.write('\x1b[?1049l\x1b[?25h'); process.exit(0); });
    process.on('SIGTERM', () => { clearInterval(interval); tailer.stop(); process.stdout.write('\x1b[?1049l\x1b[?25h'); process.exit(0); });
    return;
  }

  // Auto-detect mode: session pool
  syncSessionPool();
  const { index: initIdx, count: initCount } = getSessionPosition();
  scrollOffset = render(getCurrentState(), cols, rows, scrollOffset, initIdx, initCount);

  const interval = setInterval(() => {
    syncSessionPool();
    cols = getCols();
    rows = getRows();
    const { index, count } = getSessionPosition();
    scrollOffset = render(getCurrentState(), cols, rows, scrollOffset, index, count);
  }, RENDER_INTERVAL_MS);

  process.on('SIGWINCH', () => { cols = getCols(); rows = getRows(); });

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('keypress', (_, key) => {
      if (!key) return;

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        shutdown(interval);
      }

      if (key.name === 'tab') {
        if (sortedSessionPaths.length <= 1) return;
        const currentIndex = currentSessionPath ? sortedSessionPaths.indexOf(currentSessionPath) : 0;
        const nextIndex = (currentIndex + 1) % sortedSessionPaths.length;
        currentSessionPath = sortedSessionPaths[nextIndex];
        scrollOffset = 0;
        const { index, count } = getSessionPosition();
        scrollOffset = render(getCurrentState(), cols, rows, scrollOffset, index, count);
      }

      if (key.name === 'r') {
        cols = getCols(); rows = getRows();
        const { index, count } = getSessionPosition();
        scrollOffset = render(getCurrentState(), cols, rows, scrollOffset, index, count);
      }

      if (key.name === 'j' || key.name === 'down') {
        scrollOffset++;
        const { index, count } = getSessionPosition();
        scrollOffset = render(getCurrentState(), cols, rows, scrollOffset, index, count);
      }
      if (key.name === 'k' || key.name === 'up') {
        if (scrollOffset > 0) {
          scrollOffset--;
          const { index, count } = getSessionPosition();
          scrollOffset = render(getCurrentState(), cols, rows, scrollOffset, index, count);
        }
      }
    });
  }

  process.on('SIGINT', () => shutdown(interval));
  process.on('SIGTERM', () => shutdown(interval));
}

main();
